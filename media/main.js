// --- Imports ---
import van from './van.min.js';

// --- VanJS Tags ---
const { div, span, pre, code, button, a } = van.tags;

// ================================================================
// 独自 Lean 4 シンタックスハイライタ（静的 HTML ビューアから移植）
// Prism に依存せず、Lean 4 専用トークンを高精度で分類する。
// ================================================================
const _KW = new Set([
    'def','abbrev','theorem','lemma','example','noncomputable',
    'private','protected','instance','class','structure','inductive','where','with',
    'extends','deriving','namespace','end','section','open','import','export',
    'universe','variable','attribute','notation','macro','syntax','elab',
    'by','do','return','let','have','show','from','fun','match','if','then','else',
    'for','while','mut','pure','calc','suffices','obtain','refine','exact','apply',
    'intro','intros','cases','induction','constructor','use','rfl','simp','ring',
    'omega','linarith','norm_num','decide','native_decide','trivial','assumption',
    'contradiction','aesop','tauto','field_simp','push_neg','pull_neg',
    'partial','unsafe','opaque','axiom'
]);
const _TY = new Set([
    'Nat','Int','Bool','String','Float','Char','UInt8','UInt16',
    'UInt32','UInt64','Int8','Int16','Int32','Int64','List','Array','Vector',
    'Option','Result','IO','Type','Prop','Sort','Unit','Empty','True','False',
    'Eq','And','Or','Not','Iff','Exists','Sigma','Subtype','Fin','BitVec'
]);
const _TA = new Set([
    'native_decide','decide','rfl','simp','ring','omega',
    'linarith','norm_num','exact','apply','intro','intros','cases','rcases',
    'induction','constructor','use','refine','suffices','obtain','contradiction',
    'trivial','assumption','aesop','tauto','field_simp','push_neg','pull_neg',
    'positivity','norm_cast','push_cast','ext','funext','congr','conv','rw',
    'rewrite','gcongr','abel'
]);

function _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _hlLine(raw) {
    // -- コメント位置を探す（文字列の外側のみ）
    let cmt = -1, inStr = false;
    for (let i = 0; i < raw.length - 1; i++) {
        if (raw[i] === '"' && (i === 0 || raw[i - 1] !== '\\')) inStr = !inStr;
        if (!inStr && raw[i] === '-' && raw[i + 1] === '-') { cmt = i; break; }
    }
    const codePart = cmt >= 0 ? raw.slice(0, cmt) : raw;
    const tailPart = cmt >= 0 ? raw.slice(cmt) : '';

    let out = '', i = 0;
    while (i < codePart.length) {
        const ch = codePart[i];

        // 文字列リテラル
        if (ch === '"') {
            let j = i + 1;
            while (j < codePart.length && (codePart[j] !== '"' || codePart[j - 1] === '\\')) j++;
            out += `<span class="hl-string">${_esc(codePart.slice(i, j + 1))}</span>`;
            i = j + 1; continue;
        }

        // 数値リテラル（0b / 0x プレフィックス含む）
        if (ch === '0' && i + 1 < codePart.length && (codePart[i + 1] === 'b' || codePart[i + 1] === 'x')) {
            let j = i + 2;
            while (j < codePart.length && /[0-9a-fA-F_]/.test(codePart[j])) j++;
            let sf = '';
            if (j < codePart.length && codePart[j] === '#') {
                let k = j + 1;
                while (k < codePart.length && /\d/.test(codePart[k])) k++;
                sf = _esc(codePart.slice(j, k)); j = k;
            }
            out += `<span class="hl-number">${_esc(codePart.slice(i, j))}${sf}</span>`;
            i = j; continue;
        }
        if (/\d/.test(ch) && (i === 0 || !/\w/.test(codePart[i - 1]))) {
            let j = i;
            while (j < codePart.length && /[\d_]/.test(codePart[j])) j++;
            out += `<span class="hl-number">${_esc(codePart.slice(i, j))}</span>`;
            i = j; continue;
        }

        // 識別子・キーワード
        if (/[a-zA-Z_]/.test(ch) || ch.charCodeAt(0) > 127) {
            let j = i + 1;
            while (j < codePart.length && (
                /[\w']/.test(codePart[j]) ||
                /[₀-₉]/.test(codePart[j]) ||
                codePart.charCodeAt(j) > 127
            )) j++;
            const w = codePart.slice(i, j);
            const e = _esc(w);
            if      (_KW.has(w)) out += `<span class="hl-keyword">${e}</span>`;
            else if (_TA.has(w)) out += `<span class="hl-tactic">${e}</span>`;
            else if (_TY.has(w)) out += `<span class="hl-type">${e}</span>`;
            else if (/^[A-Z]/.test(w)) out += `<span class="hl-type">${e}</span>`;
            else out += e;
            i = j; continue;
        }

        // 演算子
        let hit = false;
        for (const op of ['^^^','&&&','|||','<<<','>>>','<|>',':=','=>','->','<-','::','..']) {
            if (codePart.startsWith(op, i)) {
                out += `<span class="hl-op">${_esc(op)}</span>`;
                i += op.length; hit = true; break;
            }
        }
        if (hit) continue;

        out += _esc(ch); i++;
    }

    if (tailPart) out += `<span class="hl-comment">${_esc(tailPart)}</span>`;
    return out;
}

/**
 * Lean 4 ソースコード全体をシンタックスハイライトし、
 * innerHTML にセット可能な HTML 文字列を返す。
 */
function hlLean(codeText) {
    return codeText.split('\n').map(_hlLine).join('\n');
}

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

        // Effects (hl, MathJax)
        setTimeout(async () => {
            if (signal.aborted) return;

            // タスク5: Markdown 内の ```lean コードフェンスを hlLean() でハイライト
            dom.querySelectorAll('pre code').forEach(el => {
                if (signal.aborted) return;
                const isLean = el.classList.contains('language-lean') ||
                               el.classList.contains('language-lean4');
                if (isLean) {
                    // hlLean は HTML エスケープ済み文字列を返す → innerHTML に直接セット
                    el.innerHTML = hlLean(el.textContent || '');
                }
            });

            // MathJax
            if (window.MathJax && MathJax.typesetPromise) {
                try {
                    await MathJax.typesetPromise([dom]);
                    if (signal.aborted) return;
                    // タスク2: display math の縦スクロールバー防止
                    // mjx-container[display="true"] を .mjx-display-wrap で包む
                    dom.querySelectorAll('mjx-container[display="true"]').forEach(el => {
                        if (!el.parentElement.classList.contains('mjx-display-wrap')) {
                            const wrap = document.createElement('div');
                            wrap.className = 'mjx-display-wrap';
                            el.parentNode.insertBefore(wrap, el);
                            wrap.appendChild(el);
                        }
                    });
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

        // タスク3: ヘッダーバー追加
        const header = div({ class: "block-code-header" }, "lean4");
        // タスク5: 独自 hlLean() でハイライト（Prism 不使用）
        const preEl = pre({ class: "lean-source" });
        preEl.innerHTML = hlLean(displaySource);
        const dom = div({ class: "code-cell" }, header, preEl);

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

    // ================================================================
    // タスク4: TOC（目次）自動生成
    // ノートブック内の h1/h2/h3 を走査してサイドバーにリンクを追加する。
    // DOM が更新されるたびに再生成する（MutationObserver）。
    // ================================================================
    function buildToc() {
        const toc = document.getElementById('toc');
        if (!toc) return;

        const notebook = document.getElementById('app');
        if (!notebook) return;

        const headings = notebook.querySelectorAll('h1, h2, h3');
        if (headings.length === 0) return;

        let tocHtml = '';
        let headingIdx = 0;
        headings.forEach(h => {
            // ID が未設定なら付与する
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

    // DOM 変化を監視して TOC を再構築
    const tocObserver = new MutationObserver(() => {
        // debounce: 連続更新時に 1 回だけ実行
        clearTimeout(tocObserver._timer);
        tocObserver._timer = setTimeout(buildToc, 200);
    });
    const appEl = document.getElementById('app');
    if (appEl) {
        tocObserver.observe(appEl, { childList: true, subtree: true });
    }

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

