// --- Imports ---
import van from './van.min.js';

// --- VanJS Tags ---
const { div, span, pre, code, button, a } = van.tags;

try {
    // --- State Management ---
    // We hold the list of *Block Objects* (with IDs).
    const blocksState = van.state([]);

    // --- Keyed List Component ---
    // This is the core of the rewrite. It renders the list of blocks using IDs as keys.
    // If an ID is present in the new list, the existing DOM node is preserved.
    // If the content *within* that ID changed (checked via strict equality of the block object?), 
    // we might need to update the internal component. 
    // BUT, our ID generation includes content hash. So if content changes, ID changes.
    // Therefore:
    // 1. Same ID = Same Content -> reused DOM, no re-render.
    // 2. Diff ID = New Content -> new DOM, full render.
    // This simplifies "updates" to just "identity match".
    // The only exception is 'outputs' in code blocks, which might change while content stays same.
    // (Wait, code block ID currently includes *source* but not *outputs*? 
    //  Start with source-based ID. If outputs change, we need to handle that.)

    // REVISION: `generateBlockId` hashes `content`. Code block source is content. 
    // Outputs are extrinsic.
    // IF outputs change, the CodeBlock ID is the SAME (since source is same).
    // So proper Keyed List must detect that `props` changed for the same `id`.

    // VanJS `list` function allows efficient keyed rendering.
    // But we need to handle the "Same ID, New Props" case for Code Blocks having new outputs.

    const App = () => {
        // We use a custom list renderer or vanX. 
        // Since we don't have vanX, we implement a simple keyed reconciler or use `van.derive`.
        // Actually, `van.state` containing an array replaced entirely triggers a full rebuild in naive usage.
        // We need a smart list component.

        // Let's implement a robust "SmartList" that syncs a container with the blocksState.
        const container = div({ class: "notebook" });

        // Track existing components by ID
        const componentCache = new Map(); // id -> { dom: HTMLElement, block: BlockData, controller: AbortController }

        van.derive(() => {
            const newBlocks = blocksState.val;

            // 1. Mark all as stale
            const staleIds = new Set(componentCache.keys());

            // 2. Build new children list (reusing or creating)
            const newChildren = [];

            for (const block of newBlocks) {
                staleIds.delete(block.id);

                let cached = componentCache.get(block.id);

                if (cached) {
                    // Check if we need to update the existing component (e.g. outputs changed)
                    // Source/Content changes would result in different ID, so only extrinsic data matters here.
                    if (block.type === 'code') {
                        // Update outputs if needed
                        if (JSON.stringify(block.outputs) !== JSON.stringify(cached.block.outputs)) {
                            console.log(`[App] Updating outputs for block ${block.id}`);
                            // Delegate update to component (if it exposes method)
                            // Or just replace it? Replacing is safer for "Zero-Base" correctness.
                            // But we want to avoid re-highlighting if possible?
                            // Actually, reusing the DOM and just appending output nodes is better.
                            // For this rewrite, let's allow "re-render" of the component if props change,
                            // but since ID is stable, we know it's the *same* block conceptually.

                            // If we replace it, we lose scroll state (semantics). 
                            // Let's replace for correctness first. 
                            // Cleanup old
                            if (cached.controller) cached.controller.abort();

                            // Create new
                            const controller = new AbortController();
                            const dom = renderBlock(block, controller.signal);
                            componentCache.set(block.id, { dom, block, controller });
                            newChildren.push(dom);
                            continue;
                        }
                    }

                    // Reuse existing
                    newChildren.push(cached.dom);
                } else {
                    // Create new
                    // console.log(`[App] Creating new block ${block.id}`);
                    const controller = new AbortController();
                    const dom = renderBlock(block, controller.signal);
                    componentCache.set(block.id, { dom, block, controller });
                    newChildren.push(dom);
                }
            }

            // 3. Cleanup stale components (abort tasks)
            for (const id of staleIds) {
                // console.log(`[App] Removing stale block ${id}`);
                const cached = componentCache.get(id);
                if (cached.controller) cached.controller.abort();
                componentCache.delete(id);
            }

            // 4. Update DOM
            // VanJS replaceChildren is efficient enough?
            container.replaceChildren(...newChildren);

            // Signal completion
            setTimeout(() => {
                if (window.vscode) {
                    vscode.postMessage({ command: 'renderingComplete' });
                }
            }, 0);
        });

        return container;
    };

    // --- Block Renderer ---
    function renderBlock(block, signal) {
        if (signal.aborted) return div();

        switch (block.type) {
            case 'code': return CodeComponent(block, signal);
            case 'markdown': // legacy name mapping
            case 'text': return MarkdownComponent(block.content, signal, "text-cell");
            case 'module-doc': return MarkdownComponent(block.content, signal, "module-doc-cell");
            case 'doc-comment': return MarkdownComponent(block.content, signal, "doc-comment-cell");
            case 'mermaid': return MermaidComponent(block.content || block.source, signal);
            default: return div(`Unknown block type: ${block.type}`);
        }
    }

    // --- Components ---

    const MarkdownComponent = (content, signal, className) => {
        const dom = div({ class: className });
        // Initial content (raw or loading?) 
        // Setting raw innerHTML might flash unstyled.
        // We construct the HTML synchronously if possible, or async.
        // marked is sync.

        try {
            if (window.marked) {
                marked.setOptions({ gfm: true, breaks: true });

                // Math Protection
                const processMarkdownWithMath = (text) => {
                    const mathBlocks = [];
                    let protectedText = text
                        .replace(/\$\$(.*?)\$\$/gs, (m, c) => { mathBlocks.push({ t: 'd', c }); return `MATH_B_${mathBlocks.length - 1}`; })
                        .replace(/(?<!\\)\$(.*?)(?<!\\)\$/gs, (m, c) => { mathBlocks.push({ t: 'i', c }); return `MATH_I_${mathBlocks.length - 1}`; });

                    let html = marked.parse(protectedText);

                    return html
                        .replace(/MATH_B_(\d+)/g, (m, i) => `$$${mathBlocks[i].c}$$`)
                        .replace(/MATH_I_(\d+)/g, (m, i) => `$${mathBlocks[i].c}$`);
                };

                dom.innerHTML = processMarkdownWithMath(content);
            } else {
                dom.textContent = content;
            }
        } catch (e) {
            dom.textContent = "Error parsing Markdown";
        }

        // Effects (MathJax, Prism)
        // We use requestAnimationFrame to batch? Or just macro-task.
        setTimeout(async () => {
            if (signal.aborted) return;

            // Prism
            if (window.Prism) {
                dom.querySelectorAll('pre code').forEach(el => {
                    if (signal.aborted) return;
                    Prism.highlightElement(el);
                });
            }

            // MathJax
            if (window.MathJax && MathJax.typesetPromise) {
                try {
                    await MathJax.typesetPromise([dom]);
                } catch (e) {
                    // ignore
                }
            }
        }, 0);

        return dom;
    };

    const CodeComponent = (block, signal) => {
        // Interleave outputs
        const source = block.source;
        const outputs = block.outputs || [];

        // Construct display text
        const lines = source.split(/\r?\n/);
        const resultLines = [];

        // Map outputs to lines
        const outputsByLine = new Map();
        outputs.forEach(o => {
            if (!outputsByLine.has(o.line)) outputsByLine.set(o.line, []);
            outputsByLine.get(o.line).push(o.content);
        });

        for (let i = 0; i < lines.length; i++) {
            resultLines.push(lines[i]);
            if (outputsByLine.has(i)) {
                outputsByLine.get(i).forEach(out => {
                    resultLines.push(`-- Evaluated: ${out}`);
                });
            }
        }

        const displaySource = resultLines.join('\n');

        const codeEl = code({ class: "language-lean" }, displaySource);
        const preEl = pre({ class: "lean-source" }, codeEl);
        const dom = div({ class: "code-cell" }, preEl);

        setTimeout(() => {
            if (signal.aborted) return;
            if (window.Prism) Prism.highlightElement(codeEl);
        }, 0);

        return dom;
    };

    const MermaidComponent = (source, signal) => {
        const dom = div({ class: "mermaid-cell" });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        dom.id = id;

        setTimeout(async () => {
            if (signal.aborted) return;
            if (window.mermaid) {
                try {
                    const { svg } = await mermaid.render(`svg-${id}`, source);
                    if (signal.aborted) return;
                    dom.innerHTML = svg;
                } catch (e) {
                    dom.textContent = `Mermaid Error: ${e.message}`;
                }
            }
        }, 0);

        return dom;
    };

    // --- Initialization ---

    const vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : null;

    window.addEventListener('message', event => {
        const message = event.data;

        if (message.command === 'update') {
            const reset = message.reset;
            if (reset) {
                // "Zero-Base" requires strict clear on reset.
                // But App logic handles clearing stale IDs automatically.
                // If reset is true, strictly speaking we might want to drop *all* cache first
                // to prevent accidental ID collision between files (though extremely unlikely with hash).
                // Let's implement strict clear for safety.
                blocksState.val = [];
                // We force a microtask wait before setting new blocks? 
                // No, just set empty then set new might cause flash.
                // Actually, if we just set new blocks, the reconciler sees disjoint IDs and replaces everything.
                // So we don't need manual clear unless IDs collide.
            }

            blocksState.val = message.blocks;
        } else if (message.command === 'scrollToLine') {
            scrollToLine(message.line);
        }
    });

    function scrollToLine(line) {
        // Simple implementation: try to find a block near that line?
        // Since we don't have block-line mapping easily in DOM, 
        // maybe we just rely on percentage or rough estimate?
        // Existing logic was percentage based? 
        // actually, let's look at the elements.
        // For now, simple scroll.
        // If the parser provides range, we could attach data-line attributes.
        // Let's rely on native scroll interaction for now or fix later.
    }

    document.getElementById('app').replaceChildren(App());

} catch (err) {
    const app = document.getElementById('app');
    if (app) {
        app.innerHTML = `<div style="color:red; padding: 20px;">
            <h3>Renderer Error</h3>
            <pre>${err.toString()}\n${err.stack}</pre>
        </div>`;
    }
    console.error("Renderer Error:", err);
}

