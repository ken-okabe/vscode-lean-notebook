// --- Imports ---
import van from './van.min.js';

// --- VanJS Tags ---
const { div, span, pre, code, button, a } = van.tags;

// hlLean, mdToHtml, wrapDisplayMath, parseLean etc. are provided by renderer.js
// which is loaded as a plain <script> before this module in NotebookPanel.ts.

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
        const container = document.getElementById('notebook');

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
            case 'text': return MarkdownComponent(block.content, signal, "block-doc-comment");
            case 'module-doc': return MarkdownComponent(block.content, signal, "block-module-doc");
            case 'doc-comment': return MarkdownComponent(block.content, signal, "block-doc-comment");
            case 'mermaid': return MermaidComponent(block.content || block.source, signal);
            case 'graphviz': return GraphvizComponent(block.content || block.source, signal);
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
                // Use shared mdToHtml from renderer.js
                dom.innerHTML = mdToHtml(content);
            } else {
                dom.textContent = content;
            }
        } catch (e) {
            dom.textContent = "Error parsing Markdown";
        }

        // Effects (hl, MathJax)
        setTimeout(async () => {
            if (signal.aborted) return;

            // Highlight ```lean code fences inside Markdown with hlLean()
            dom.querySelectorAll('pre code').forEach(el => {
                if (signal.aborted) return;
                const isLean = el.classList.contains('language-lean') ||
                    el.classList.contains('language-lean4');
                if (isLean) {
                    // hlLean returns pre-escaped HTML string → set via innerHTML
                    el.innerHTML = hlLean(el.textContent || '');
                }
            });

            // MathJax — use shared typesetMath() from renderer.js (single source of truth)
            if (!signal.aborted) await typesetMath(dom);
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

        // Map outputs to lines (keep full output objects for severity-based rendering)
        const outputsByLine = new Map();
        outputs.forEach(o => {
            if (!outputsByLine.has(o.line)) outputsByLine.set(o.line, []);
            outputsByLine.get(o.line).push(o);
        });

        for (let i = 0; i < lines.length; i++) {
            resultLines.push(lines[i]);
            if (outputsByLine.has(i)) {
                outputsByLine.get(i).forEach(out => {
                    if (out.severity === -1) {
                        // Proof status (theorem/lemma/example verified)
                        resultLines.push(`-- ✓`);
                    } else {
                        // Eval result
                        resultLines.push(`-- Evaluated: ${out.content}`);
                    }
                });
            }
        }

        const displaySource = resultLines.join('\n');

        // Header bar
        const header = div({ class: "block-code-header" }, "lean4");
        // Syntax highlighting via hlLean() (no Prism dependency)
        const preEl = pre({ class: "lean-source" });
        preEl.innerHTML = hlLean(displaySource);
        const dom = div({ class: "block-code" }, header, preEl);

        return dom;
    };

    const MermaidComponent = (source, signal) => {
        const dom = div({ class: "block-mermaid" });

        setTimeout(async () => {
            if (signal.aborted) return;
            // Use shared renderMermaid() from renderer.js
            await renderMermaid(source, dom);
        }, 0);

        return dom;
    };

    const GraphvizComponent = (source, signal) => {
        const dom = div({ class: "block-graphviz" });

        setTimeout(async () => {
            if (signal.aborted) return;
            // Use shared renderGraphviz() from renderer.js
            await renderGraphviz(source, dom);
        }, 0);

        return dom;
    };

    // --- Initialization ---

    const vscode = window.acquireVsCodeApi ? window.acquireVsCodeApi() : null;

    window.addEventListener('message', event => {
        const message = event.data;

        if (message.command === 'update') {
            // Single assignment: empty array = clear, populated array = render.
            blocksState.val = message.blocks || [];
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

    // App() manages #notebook directly via van.derive — no return value needed.
    App();

    // Signal to extension host that main.js is ready to receive messages.
    // This completes the handshake — _update() in NotebookPanel.ts waits
    // for this signal before posting 'update' messages.
    if (vscode) {
        vscode.postMessage({ command: 'ready' });
        console.log('[main.js] Sent ready signal');
    }

    // ================================================================
    // Auto-generate Table of Contents (TOC)
    // Scans h1/h2/h3 inside #notebook and adds links to the sidebar.
    // Regenerated on every DOM mutation via MutationObserver.
    // ================================================================
    function buildToc() {
        const toc = document.getElementById('toc');
        if (!toc) return;

        const notebook = document.getElementById('notebook');
        if (!notebook) return;

        const headings = notebook.querySelectorAll('h1, h2, h3');
        if (headings.length === 0) {
            toc.innerHTML = '';
            return;
        }

        let tocHtml = '';
        let headingIdx = 0;
        headings.forEach(h => {
            // Assign an ID if missing
            if (!h.id) {
                h.id = 'toc-h-' + headingIdx++;
            }
            const tag = h.tagName.toLowerCase(); // h1 / h2 / h3
            const cls = tag;                     // .h1 / .h2 / .h3
            const label = h.textContent || '';
            tocHtml += `<a href="#${h.id}" class="${cls}" title="${label}">${label}</a>\n`;
        });

        toc.innerHTML = tocHtml;
    }

    // Observe DOM mutations to rebuild TOC
    const tocObserver = new MutationObserver(() => {
        // Debounce: run once per burst of updates
        clearTimeout(tocObserver._timer);
        tocObserver._timer = setTimeout(buildToc, 200);
    });
    const appEl = document.getElementById('notebook');
    if (appEl) {
        tocObserver.observe(appEl, { childList: true, subtree: true });
    }

} catch (err) {
    const app = document.getElementById('notebook');
    if (app) {
        app.innerHTML = `<div style="color:red; padding: 20px;">
            <h3>Renderer Error</h3>
            <pre>${err.toString()}\n${err.stack}</pre>
        </div>`;
    }
    console.error("Renderer Error:", err);
}

