// ================================================================
// renderer.js — Shared rendering logic for LeanNotebook
// Used by both the VSCode WebView (main.js) and HTML export (template.html).
// DO NOT add VSCode-specific or VanJS-specific code here.
// ================================================================

// ----------------------------------------------------------------
// Lean 4 Syntax Highlighter
// ----------------------------------------------------------------
const LR_KW = new Set([
    'def', 'abbrev', 'theorem', 'lemma', 'example', 'noncomputable',
    'private', 'protected', 'instance', 'class', 'structure', 'inductive', 'where', 'with',
    'extends', 'deriving', 'namespace', 'end', 'section', 'open', 'import', 'export',
    'universe', 'variable', 'attribute', 'notation', 'macro', 'syntax', 'elab',
    'by', 'do', 'return', 'let', 'have', 'show', 'from', 'fun', 'match', 'if', 'then', 'else',
    'for', 'while', 'mut', 'pure', 'calc', 'suffices', 'obtain', 'refine', 'exact', 'apply',
    'intro', 'intros', 'cases', 'induction', 'constructor', 'use', 'rfl', 'simp', 'ring',
    'omega', 'linarith', 'norm_num', 'decide', 'native_decide', 'trivial', 'assumption',
    'contradiction', 'aesop', 'tauto', 'field_simp', 'push_neg', 'pull_neg',
    'partial', 'unsafe', 'opaque', 'axiom'
]);
const LR_TY = new Set([
    'Nat', 'Int', 'Bool', 'String', 'Float', 'Char', 'UInt8', 'UInt16',
    'UInt32', 'UInt64', 'Int8', 'Int16', 'Int32', 'Int64', 'List', 'Array', 'Vector',
    'Option', 'Result', 'IO', 'Type', 'Prop', 'Sort', 'Unit', 'Empty', 'True', 'False',
    'Eq', 'And', 'Or', 'Not', 'Iff', 'Exists', 'Sigma', 'Subtype', 'Fin', 'BitVec'
]);
const LR_TA = new Set([
    'native_decide', 'decide', 'rfl', 'simp', 'ring', 'omega',
    'linarith', 'norm_num', 'exact', 'apply', 'intro', 'intros', 'cases', 'rcases',
    'induction', 'constructor', 'use', 'refine', 'suffices', 'obtain', 'contradiction',
    'trivial', 'assumption', 'aesop', 'tauto', 'field_simp', 'push_neg', 'pull_neg',
    'positivity', 'norm_cast', 'push_cast', 'ext', 'funext', 'congr', 'conv', 'rw',
    'rewrite', 'gcongr', 'abel'
]);

function lrEsc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function lrHlLine(raw) {
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
        if (ch === '"') {
            let j = i + 1;
            while (j < codePart.length && (codePart[j] !== '"' || codePart[j - 1] === '\\')) j++;
            out += `<span class="hl-string">${lrEsc(codePart.slice(i, j + 1))}</span>`;
            i = j + 1; continue;
        }
        if (ch === '0' && i + 1 < codePart.length && (codePart[i + 1] === 'b' || codePart[i + 1] === 'x')) {
            let j = i + 2;
            while (j < codePart.length && /[0-9a-fA-F_]/.test(codePart[j])) j++;
            let sf = '';
            if (j < codePart.length && codePart[j] === '#') {
                let k = j + 1;
                while (k < codePart.length && /\d/.test(codePart[k])) k++;
                sf = lrEsc(codePart.slice(j, k)); j = k;
            }
            out += `<span class="hl-number">${lrEsc(codePart.slice(i, j))}${sf}</span>`;
            i = j; continue;
        }
        if (/\d/.test(ch) && (i === 0 || !/\w/.test(codePart[i - 1]))) {
            let j = i;
            while (j < codePart.length && /[\d_]/.test(codePart[j])) j++;
            out += `<span class="hl-number">${lrEsc(codePart.slice(i, j))}</span>`;
            i = j; continue;
        }
        if (/[a-zA-Z_]/.test(ch) || ch.charCodeAt(0) > 127) {
            let j = i + 1;
            while (j < codePart.length && (
                /[\w']/.test(codePart[j]) ||
                /[₀-₉]/.test(codePart[j]) ||
                codePart.charCodeAt(j) > 127
            )) j++;
            const w = codePart.slice(i, j), e = lrEsc(w);
            if (LR_KW.has(w)) out += `<span class="hl-keyword">${e}</span>`;
            else if (LR_TA.has(w)) out += `<span class="hl-tactic">${e}</span>`;
            else if (LR_TY.has(w)) out += `<span class="hl-type">${e}</span>`;
            else if (/^[A-Z]/.test(w)) out += `<span class="hl-type">${e}</span>`;
            else out += e;
            i = j; continue;
        }
        let hit = false;
        for (const op of ['^^^', '&&&', '|||', '<<<', '>>>', '<|>', ':=', '=>', '->', '<-', '::', '..']) {
            if (codePart.startsWith(op, i)) {
                out += `<span class="hl-op">${lrEsc(op)}</span>`;
                i += op.length; hit = true; break;
            }
        }
        if (hit) continue;
        out += lrEsc(ch); i++;
    }
    if (tailPart) out += `<span class="hl-comment">${lrEsc(tailPart)}</span>`;
    return out;
}

function hlLean(codeText) {
    return codeText.split('\n').map(lrHlLine).join('\n');
}

// ----------------------------------------------------------------
// Markdown + Math renderer
// Uses string-based placeholders so marked cannot strip them.
// This is the canonical implementation used by BOTH VSCode WebView
// and the HTML export. Do not duplicate this logic elsewhere.
// ----------------------------------------------------------------
function mdToHtml(content) {
    const mathBlocks = [];
    const PH_D = (i) => `LNMATH_D_${i}_END`;
    const PH_I = (i) => `LNMATH_I_${i}_END`;

    let s = content;
    // Display math first (multi-line)
    s = s.replace(/\$\$([\s\S]*?)\$\$/g, (m, c) => {
        const i = mathBlocks.length;
        mathBlocks.push({ t: 'd', c });
        return PH_D(i);
    });
    // Inline math (single line, not crossing $)
    s = s.replace(/\$([^$\n]+?)\$/g, (m, c) => {
        const i = mathBlocks.length;
        mathBlocks.push({ t: 'i', c });
        return PH_I(i);
    });

    let html = (typeof marked !== 'undefined')
        ? marked.parse(s)
        : s.replace(/\n/g, '<br>');

    // Restore math with original delimiters.
    // IMPORTANT: use $$ and $ (not \[..\] / \(..\)) because the JS escape sequences
    // \[ and \( collapse to [ and ( in string literals, breaking MathJax recognition.
    html = html.replace(/LNMATH_D_(\d+)_END/g, (_, i) => `$$${mathBlocks[+i].c}$$`);
    html = html.replace(/LNMATH_I_(\d+)_END/g, (_, i) => `$${mathBlocks[+i].c}$`);
    return html;
}

// ----------------------------------------------------------------
// Mermaid renderer — single shared implementation
// Call renderMermaid(source, containerEl) from both main.js and template.html.
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// CDN URLs — single source of truth.
// htmlExporter.ts and NotebookPanel.ts extract these at build/load time.
// ----------------------------------------------------------------
const MATHJAX_CDN_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js';

const MERMAID_THEME = {
    startOnLoad: false,
    theme: 'neutral',
    flowchart: { useMaxWidth: false },
    themeVariables: {
        background: '#ffffff',
        mainBkg: '#dbeafe',
        nodeBorder: '#93c5fd',
        lineColor: '#2563eb',
        textColor: '#1a2233',
        fontSize: '13px',
        primaryColor: '#dbeafe',
        primaryTextColor: '#1d4ed8',
        primaryBorderColor: '#93c5fd',
        edgeLabelBackground: '#f4f7fb',
    }
};

let _mermaidInitialized = false;
function ensureMermaidInit() {
    if (_mermaidInitialized) return;
    if (typeof mermaid === 'undefined') return;
    mermaid.initialize(MERMAID_THEME);
    _mermaidInitialized = true;
}

// Render a mermaid diagram into containerEl.
// Returns a Promise that resolves when done.
async function renderMermaid(source, containerEl) {
    if (typeof mermaid === 'undefined') {
        containerEl.textContent = 'Mermaid not loaded';
        return;
    }
    ensureMermaidInit();
    const id = 'mx-' + Math.random().toString(36).slice(2);
    try {
        const { svg } = await mermaid.render(id, source);
        containerEl.innerHTML = svg;
        // Remove Mermaid's inline height/max-height constraints.
        // Do NOT set width:100% — wide diagrams (e.g. dependency graphs)
        // would be forced into the container width, compressing height
        // proportionally via viewBox aspect-ratio preservation.
        // Instead, let the SVG keep its natural dimensions and rely on
        // CSS overflow-x:auto on .block-mermaid for horizontal scrolling.
        const svgEl = containerEl.querySelector('svg');
        if (svgEl) {
            svgEl.removeAttribute('height');
            svgEl.style.removeProperty('max-height');
        }
    } catch (e) {
        containerEl.textContent = `Mermaid Error: ${e.message}`;
    }
}

// ----------------------------------------------------------------
// Graphviz (DOT) renderer — via @viz-js/viz (Graphviz WASM)
// Single shared implementation for both WebView and HTML export.
// ----------------------------------------------------------------
let _vizInstance = null;
let _vizInstancePromise = null;

function getVizInstance() {
    if (_vizInstance) return Promise.resolve(_vizInstance);
    if (_vizInstancePromise) return _vizInstancePromise;
    if (typeof Viz === 'undefined') return Promise.reject(new Error('Viz.js not loaded'));
    _vizInstancePromise = Viz.instance().then(viz => {
        _vizInstance = viz;
        _vizInstancePromise = null;
        return viz;
    });
    return _vizInstancePromise;
}

// Render a Graphviz DOT diagram into containerEl.
// Returns a Promise that resolves when done.
async function renderGraphviz(source, containerEl) {
    try {
        const viz = await getVizInstance();
        const svgEl = viz.renderSVGElement(source);
        containerEl.innerHTML = '';
        containerEl.appendChild(svgEl);
    } catch (e) {
        containerEl.textContent = `Graphviz Error: ${e.message || e}`;
    }
}

// ----------------------------------------------------------------
// MathJax: typeset a container and wrap display math.
// Call typesetMath(container) from BOTH main.js and template.html.
// This is the single shared implementation — do not duplicate.
// ----------------------------------------------------------------
function wrapDisplayMath(container) {
    container.querySelectorAll('mjx-container[display="true"]').forEach(el => {
        if (!el.parentElement.classList.contains('mjx-display-wrap')) {
            const wrap = document.createElement('div');
            wrap.className = 'mjx-display-wrap';
            el.parentNode.insertBefore(wrap, el);
            wrap.appendChild(el);
        }
    });
}

// Typeset MathJax in container, then wrap display math.
// Returns a Promise. Safe to call even if MathJax is not loaded.
function typesetMath(container) {
    if (window.MathJax && MathJax.typesetPromise) {
        return MathJax.typesetPromise([container])
            .then(() => wrapDisplayMath(container))
            .catch(console.warn);
    }
    return Promise.resolve();
}

// The canonical MathJax configuration object.
// Used verbatim in both NotebookPanel.ts (Extension) and template.html (HTML export).
// inlineMath uses $...$ only (not \(...\) to avoid JS escape issues).
// displayMath uses $$...$$ only.
const MATHJAX_CONFIG = {
    tex: {
        inlineMath: [['$', '$']],
        displayMath: [['$$', '$$']],
        processEscapes: true
    },
    options: {
        skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
    },
    startup: { typeset: false }
};

// ----------------------------------------------------------------
// Lean comment parser (port of leanCommentParser.ts)
// ----------------------------------------------------------------
function trimEmptyLines(code) {
    const lines = code.split('\n');
    let s = 0;
    while (s < lines.length && lines[s].trim() === '') s++;
    let e = lines.length - 1;
    while (e >= 0 && lines[e].trim() === '') e--;
    if (s > e) return '';
    return lines.slice(s, e + 1).join('\n');
}

function dedent(str) {
    const lines = str.split('\n');
    let minIndent = Infinity;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim().length === 0) continue;
        const m = line.match(/^\s*/);
        const indent = m ? m[0].length : 0;
        if (indent < minIndent) minIndent = indent;
    }
    if (minIndent === Infinity) minIndent = 0;
    return lines.map((line, idx) => {
        if (idx === 0) return line.trim();
        if (line.trim().length === 0) return '';
        return line.length >= minIndent ? line.slice(minIndent) : line.trim();
    }).join('\n').trim();
}

function findDocCommentEnd(text, startPos) {
    let pos = startPos;
    let inlineTickCount = null;
    let inFence = false;
    while (pos < text.length) {
        const ch = text[pos];
        if (ch === '`') {
            let run = 1;
            while (pos + run < text.length && text[pos + run] === '`') run++;
            if (inlineTickCount === null) {
                if (run >= 3) {
                    let i = pos - 1;
                    while (i >= 0 && text[i] !== '\n') i--;
                    const prefix = text.slice(i + 1, pos);
                    if (/^\s*$/.test(prefix)) { inFence = !inFence; pos += run; continue; }
                }
                if (!inFence) { inlineTickCount = run; pos += run; continue; }
            } else {
                if (run === inlineTickCount) { inlineTickCount = null; pos += run; continue; }
            }
            pos += run; continue;
        }
        const next = (pos + 1 < text.length) ? text[pos + 1] : '';
        if (!inFence && inlineTickCount === null && ch === '-' && next === '/') return pos;
        pos += 1;
    }
    return -1;
}

function splitLeanDocComments(text) {
    const blocks = [];
    let pos = 0, last = 0;

    function pushCode(code) {
        const lines = code.split('\n');
        let s = 0;
        while (s < lines.length && lines[s].trim() === '') s++;
        const rawStartLine = text.slice(0, last).split('\n').length - 1;
        const startLine = rawStartLine + s;
        const trimmedCode = trimEmptyLines(code);
        const trimmedLineCount = trimmedCode.split('\n').length;
        const endLine = startLine + (trimmedLineCount > 0 ? trimmedLineCount - 1 : 0);
        blocks.push({ type: 'code', source: trimmedCode, range: { startLine, endLine } });
    }

    function pushComment(kind, content, startOffset) {
        const dedentedContent = dedent(content);
        const startLine = text.slice(0, startOffset).split('\n').length - 1;
        const endLine = startLine + (content.split('\n').length - 1);
        blocks.push({ type: kind, content: dedentedContent, range: { startLine, endLine } });
    }

    while (pos < text.length) {
        const nextModule = text.indexOf('/-!', pos);
        const nextDoc = text.indexOf('/--', pos);
        let start = -1, kind = null;
        if (nextModule !== -1 && (nextDoc === -1 || nextModule < nextDoc)) { start = nextModule; kind = 'module-doc'; }
        else if (nextDoc !== -1) { start = nextDoc; kind = 'doc-comment'; }
        if (start === -1) break;
        if (start > last) pushCode(text.slice(last, start));
        const contentStart = start + 3;
        const end = findDocCommentEnd(text, contentStart);
        if (end === -1) { pushCode(text.slice(start)); last = text.length; break; }
        pushComment(kind, text.slice(contentStart, end), start);
        pos = end + 2; last = pos;
    }
    if (last < text.length) pushCode(text.slice(last));

    return blocks.filter(b => {
        if (b.type === 'code') return b.source.trim().length > 0;
        if (b.type === 'mermaid') return b.source.trim().length > 0;
        if (b.type === 'graphviz') return b.source.trim().length > 0;
        return b.content.trim().length > 0;
    });
}

function splitDiagramBlocks(content) {
    const result = [];
    // Note: backticks written as \x60 to avoid breaking HTML script-tag embedding
    const TICK3 = '\x60\x60\x60';
    const re = new RegExp('^' + TICK3 + '(mermaid|graphviz|dot)\\s*\\n([\\s\\S]*?)^' + TICK3 + '\\s*$', 'gm');
    let lastIndex = 0, match;
    while ((match = re.exec(content)) !== null) {
        const textContent = content.substring(lastIndex, match.index);
        if (textContent.trim().length > 0) result.push({ type: 'text', content: textContent.trim() });
        const lang = match[1]; // 'mermaid', 'graphviz', or 'dot'
        const src = match[2];
        if (src.trim().length > 0) {
            const blockType = lang === 'mermaid' ? 'mermaid' : 'graphviz';
            result.push({ type: blockType, source: trimEmptyLines(src) });
        }
        lastIndex = re.lastIndex;
    }
    if (lastIndex < content.length) {
        const remaining = content.substring(lastIndex);
        if (remaining.trim().length > 0) result.push({ type: 'text', content: remaining.trim() });
    }
    if (result.length === 0 && content.trim().length > 0)
        result.push({ type: 'text', content: content.trim() });
    return result;
}

function expandCommentBlock(block) {
    if (block.type !== 'module-doc' && block.type !== 'doc-comment') return [block];
    const subBlocks = splitDiagramBlocks(block.content);
    if (subBlocks.length === 1 && subBlocks[0].type === 'text') return [block];
    return subBlocks.map(sub =>
        sub.type === 'text'
            ? { type: block.type, content: sub.content, range: block.range }
            : { type: sub.type, source: sub.source, range: block.range }
    );
}

function parseLean(text) {
    return splitLeanDocComments(text).flatMap(b => expandCommentBlock(b));
}
