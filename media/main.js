import van from './van.min.js';

// Global dependencies (marked, MathJax) are still loaded via global script tags for now,
// or we can treat them as globals since we aren't changing their files.
// marked and MathJax are global.

const { div, pre, span, code } = van.tags;

// Register Lean language definition for Prism.js
if (window.Prism && !Prism.languages.lean) {
    Prism.languages.lean = {
        'eval-result': {
            pattern: /--\s*Evaluated:.*$/m,
            alias: 'comment' // Inherit comment styling as base, but allows specific override
        },
        'comment': [
            {
                pattern: /--.*$/m,
                greedy: true
            },
            {
                pattern: /\/-[\s\S]*?-\//,
                greedy: true
            }
        ],
        'string': {
            pattern: /"(?:[^"\\]|\\.)*"/,
            greedy: true
        },
        'keyword': /\b(?:def|theorem|lemma|example|axiom|inductive|structure|class|instance|section|namespace|variable|universe|import|export|open|private|protected|where|let|have|show|by|from|fun|match|with|if|then|else|do|return|for|in|mut|partial|unsafe|deriving|extends|abbrev|opaque|noncomputable)\b/,
        'builtin': /\b(?:Type|Prop|Sort|Nat|Int|String|Bool|List|Array|Option|true|false)\b/,
        'number': /\b\d+\b/,
        'operator': /[:=]|[+\-*/<>]=?|[∀∃∧∨¬≠≤≥→←↔|⟨⟩]/,
        'punctuation': /[{}[\]();,.:]/
    };
    console.log('[Prism] Lean language registered');
}

// --- Components ---

const MarkdownComponent = (content, onRenderComplete) => {
    // 1. Convert Markdown to HTML
    const rawHtml = marked.parse(content);

    // 2. Create Wrapper
    const dom = div({ class: "markdown-cell" });
    dom.innerHTML = rawHtml;

    // 3. Render Math (MathJax)
    // We use a small timeout to ensure DOM insertion (or use van.effect if purely functional,
    // but direct DOM mutation for libs is simpler here)
    setTimeout(() => {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([dom]).then(() => {
                if (onRenderComplete) onRenderComplete();
            }).catch((err) => {
                console.error('MathJax error:', err);
                if (onRenderComplete) onRenderComplete();
            });
        } else {
            if (onRenderComplete) onRenderComplete();
        }
    }, 0);

    return dom;
};

const ModuleDocComponent = (content, onRenderComplete) => {
    // Module documentation (/-! comments) - structural comments with headings
    const rawHtml = marked.parse(content);
    const dom = div({ class: "module-doc-cell" });
    dom.innerHTML = rawHtml;

    setTimeout(() => {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([dom]).then(() => {
                if (onRenderComplete) onRenderComplete();
            }).catch((err) => {
                console.error('MathJax error:', err);
                if (onRenderComplete) onRenderComplete();
            });
        } else {
            if (onRenderComplete) onRenderComplete();
        }
    }, 0);

    return dom;
};

const DocCommentComponent = (content, onRenderComplete) => {
    // Doc comment (/-- comments) - definition/theorem explanations
    const rawHtml = marked.parse(content);
    const dom = div({ class: "doc-comment-cell" });
    dom.innerHTML = rawHtml;

    setTimeout(() => {
        if (window.MathJax && MathJax.typesetPromise) {
            MathJax.typesetPromise([dom]).then(() => {
                if (onRenderComplete) onRenderComplete();
            }).catch((err) => {
                console.error('MathJax error:', err);
                if (onRenderComplete) onRenderComplete();
            });
        } else {
            if (onRenderComplete) onRenderComplete();
        }
    }, 0);

    return dom;
};

const CodeComponent = (source, outputs, language = 'lean', onRenderComplete) => {
    // Strategy: Interleave outputs into the source code as comments
    // This preserves the "Literate" style and ensures 1:1 alignment without complex DOM hacking.

    let displaySource = source;

    if (outputs && outputs.length > 0) {
        // Sort outputs by line number descending so insertions don't mess up indices?
        // Actually we need to insert based on line number.
        // Splitting by newline is easiest.

        const lines = source.split(/\r?\n/);
        const newLines = [];

        // Map outputs to lines. output.line is 0-based index relative to the block.
        const outputsByLine = new Map();
        outputs.forEach(o => {
            if (!outputsByLine.has(o.line)) {
                outputsByLine.set(o.line, []);
            }
            outputsByLine.get(o.line).push(o.content);
        });

        for (let i = 0; i < lines.length; i++) {
            newLines.push(lines[i]);

            // If there are outputs for this line, append them as new lines
            if (outputsByLine.has(i)) {
                const results = outputsByLine.get(i);
                results.forEach(res => {
                    // Prefix with "-- Evaluated: " to style as distinct eval result
                    newLines.push(`-- Evaluated: ${res}`);
                });
            }
        }

        displaySource = newLines.join('\n');
    }

    // Create code element with Prism highlighting
    const langClass = language ? `language-${language}` : 'language-lean';
    const codeElement = code({ class: langClass }, displaySource);
    const preElement = pre({ class: "lean-source" }, codeElement);

    // Apply Prism highlighting after DOM insertion
    setTimeout(() => {
        if (window.Prism) {
            Prism.highlightElement(codeElement);
        }
        if (onRenderComplete) onRenderComplete();
    }, 0);

    return div({ class: "code-cell" },
        // Source with Prism highlighting (now contains results as comments)
        preElement
    );
};

const TextComponent = (content, onRenderComplete) => {
    const container = div({ class: "text-cell" });

    // Render Markdown with MathJax support
    setTimeout(() => {
        if (window.marked) {
            const html = marked.parse(content);
            container.innerHTML = html;

            // Render math equations
            if (window.MathJax && MathJax.typesetPromise) {
                MathJax.typesetPromise([container]).then(() => {
                    if (onRenderComplete) onRenderComplete();
                }).catch((err) => {
                    console.error('MathJax error:', err);
                    if (onRenderComplete) onRenderComplete();
                });
                return; // Don't call onRenderComplete twice
            }
        }
        if (onRenderComplete) onRenderComplete();
    }, 0);

    return container;
};

const MermaidComponent = (source, onRenderComplete) => {
    const container = div({ class: "mermaid-cell" });
    const uniqueId = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
    container.id = uniqueId;

    // Render Mermaid diagram
    setTimeout(() => {
        if (window.mermaid) {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default'
            });

            try {
                mermaid.render(`mermaid-svg-${uniqueId}`, source).then(result => {
                    container.innerHTML = result.svg;
                    if (onRenderComplete) onRenderComplete();
                }).catch(err => {
                    console.error('Mermaid rendering error:', err);
                    container.innerHTML = `<pre class="error">Mermaid Error: ${err.message}</pre>`;
                    if (onRenderComplete) onRenderComplete();
                });
            } catch (err) {
                console.error('Mermaid rendering error:', err);
                container.innerHTML = `<pre class="error">Mermaid Error: ${err.message}</pre>`;
                if (onRenderComplete) onRenderComplete();
            }
        } else {
            if (onRenderComplete) onRenderComplete();
        }
    }, 0);

    return container;
};

// --- App State ---

const blocksState = van.state([]);
let renderingComplete = false;
let pendingRenders = 0;

function onBlockRenderComplete() {
    pendingRenders--;
    console.log(`[Render] Block complete. Pending: ${pendingRenders}`);

    if (pendingRenders === 0 && !renderingComplete) {
        renderingComplete = true;
        const totalBlocks = blocksState.val.length;

        // For large documents (>100 blocks), add extra safety margin
        const isLargeDocument = totalBlocks > 100;
        const extraDelay = isLargeDocument ? 500 : 0;

        console.log(`[Render] All blocks rendered (${totalBlocks} blocks). Extra delay: ${extraDelay}ms`);

        setTimeout(() => {
            // Notify extension that rendering is complete
            if (window.vscode) {
                vscode.postMessage({
                    command: 'renderingComplete'
                });
            }

            // If there's a pending scroll, execute it now
            if (pendingScrollLine !== null) {
                const lineToScroll = pendingScrollLine;
                pendingScrollLine = null;
                console.log(`[Render] Executing pending scroll to line ${lineToScroll}`);

                requestAnimationFrame(() => {
                    scrollToLine(lineToScroll);
                });
            }
        }, extraDelay);
    }
}

// --- Main App ---

const App = () => {
    return div({ class: "notebook" },
        // Reactive list rendering: pass a function that returns the children
        () => div(
            blocksState.val.map((block, index) => {
                // Keying could be improved for perf, but map is fine for now
                if (block.type === 'module-doc') {
                    // Module documentation (/-! comments) - structural comments with headings
                    return ModuleDocComponent(block.content, onBlockRenderComplete);
                } else if (block.type === 'doc-comment') {
                    // Doc comment (/-- comments) - definition/theorem explanations
                    return DocCommentComponent(block.content, onBlockRenderComplete);
                } else if (block.type === 'markdown') {
                    // Lean file markdown block (legacy support)
                    return MarkdownComponent(block.content, onBlockRenderComplete);
                } else if (block.type === 'text') {
                    // Markdown file text block
                    return TextComponent(block.content, onBlockRenderComplete);
                } else if (block.type === 'code') {
                    // Code block (Lean or Markdown)
                    const language = block.language || 'lean';
                    return CodeComponent(block.source, block.outputs, language, onBlockRenderComplete);
                } else if (block.type === 'mermaid') {
                    // Mermaid diagram block
                    return MermaidComponent(block.source, onBlockRenderComplete);
                }
                return null;
            })
        )
    );
};

// Mount
console.log("[main.js] Mounting App...");
van.add(document.getElementById("app"), App());

// --- Messaging ---

let pendingScrollLine = null;
let scrollAttempts = 0;
const MAX_SCROLL_ATTEMPTS = 10;

function attemptScroll(line, attempt = 0) {
    const blocks = blocksState.val;

    // Check if blocks are loaded
    if (!blocks || blocks.length === 0) {
        if (attempt < MAX_SCROLL_ATTEMPTS) {
            console.log(`[Scroll] Blocks not ready yet, attempt ${attempt + 1}/${MAX_SCROLL_ATTEMPTS}`);
            setTimeout(() => attemptScroll(line, attempt + 1), 200);
        } else {
            console.log(`[Scroll] Failed to scroll after ${MAX_SCROLL_ATTEMPTS} attempts`);
        }
        return;
    }

    // Check if DOM elements are rendered
    const app = document.getElementById('app');
    const allCells = app.querySelectorAll('.code-cell, .markdown-cell, .text-cell, .mermaid-cell');

    if (allCells.length === 0) {
        if (attempt < MAX_SCROLL_ATTEMPTS) {
            console.log(`[Scroll] DOM not ready yet, attempt ${attempt + 1}/${MAX_SCROLL_ATTEMPTS}`);
            setTimeout(() => attemptScroll(line, attempt + 1), 200);
        } else {
            console.log(`[Scroll] Failed to scroll: DOM not rendered after ${MAX_SCROLL_ATTEMPTS} attempts`);
        }
        return;
    }

    console.log(`[Scroll] Executing scroll to line ${line}, blocks=${blocks.length}, cells=${allCells.length}`);
    scrollToLine(line);
}

window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    console.log("[main.js] Message received:", message.command);
    if (message.command === 'update') {
        // Reset rendering tracking
        renderingComplete = false;
        pendingRenders = message.blocks.length;
        console.log(`[Update] Received ${message.blocks.length} blocks, starting render tracking`);

        blocksState.val = message.blocks;

        // If no blocks, mark as complete immediately
        if (message.blocks.length === 0) {
            renderingComplete = true;
            if (window.vscode) {
                vscode.postMessage({
                    command: 'renderingComplete'
                });
            }
        }

        // Note: pendingScrollLine will be handled by onBlockRenderComplete() when rendering is done
    } else if (message.command === 'scrollToLine') {
        console.log(`[Scroll] Received scrollToLine command: line=${message.line}`);

        // If rendering is already complete, scroll immediately
        if (renderingComplete) {
            console.log(`[Scroll] Rendering already complete, scrolling immediately`);
            requestAnimationFrame(() => {
                scrollToLine(message.line);
            });
        } else {
            // Otherwise, store for later (will be executed when rendering completes)
            console.log(`[Scroll] Rendering not complete yet, storing pending scroll`);
            pendingScrollLine = message.line;
        }
    }
});

// Function to scroll preview to a specific line in the source
function scrollToLine(line) {
    const blocks = blocksState.val;
    let targetIndex = -1;

    console.log(`[scrollToLine DEBUG] Target line: ${line}, Total blocks: ${blocks.length}`);

    // Find the block that contains this line (line is 0-based from editor)
    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        if (block.range) {
            // range.startLine and endLine are 1-based
            const startLine0 = block.range.startLine - 1;
            const endLine0 = block.range.endLine - 1;

            console.log(`[scrollToLine DEBUG] Block ${i}: range [${startLine0}-${endLine0}], type: ${block.type}`);

            if (line >= startLine0 && line <= endLine0) {
                targetIndex = i;
                console.log(`[scrollToLine DEBUG] Found exact match at block ${i}`);
                break;
            }
        } else {
            console.log(`[scrollToLine DEBUG] Block ${i}: NO RANGE, type: ${block.type}`);
        }
    }

    // If no exact match, find the closest block before this line
    if (targetIndex === -1 && blocks.length > 0) {
        console.log(`[scrollToLine DEBUG] No exact match, searching for closest block`);
        for (let i = blocks.length - 1; i >= 0; i--) {
            const block = blocks[i];
            if (block.range && line >= block.range.startLine - 1) {
                targetIndex = i;
                console.log(`[scrollToLine DEBUG] Found closest block ${i} at line ${block.range.startLine - 1}`);
                break;
            }
        }
        // Still no match? Use first block
        if (targetIndex === -1) {
            targetIndex = 0;
            console.log(`[scrollToLine DEBUG] No match found, using first block`);
        }
    }

    // Scroll to the target block
    if (targetIndex >= 0) {
        const app = document.getElementById('app');
        const allCells = app.querySelectorAll('.code-cell, .markdown-cell, .text-cell, .mermaid-cell');
        console.log(`[scrollToLine DEBUG] Total cells in DOM: ${allCells.length}`);

        if (allCells[targetIndex]) {
            const targetBlock = blocks[targetIndex];
            const cell = allCells[targetIndex];

            // Calculate relative position within the block
            if (targetBlock.range) {
                const blockStartLine = targetBlock.range.startLine - 1;
                const blockEndLine = targetBlock.range.endLine - 1;
                const blockLineCount = blockEndLine - blockStartLine;
                const relativePosition = (line - blockStartLine) / blockLineCount;

                console.log(`[scrollToLine DEBUG] Block ${targetIndex}: start=${blockStartLine}, end=${blockEndLine}, count=${blockLineCount}`);
                console.log(`[scrollToLine DEBUG] Target line ${line} is ${((relativePosition * 100).toFixed(1))}% into the block`);

                // Scroll to the cell first
                cell.scrollIntoView({ behavior: 'instant', block: 'start' });

                // Then add offset based on relative position within the block
                const cellRect = cell.getBoundingClientRect();
                const cellHeight = cellRect.height;
                const additionalScroll = cellHeight * relativePosition;

                console.log(`[scrollToLine DEBUG] Cell height: ${cellHeight}px, additional scroll: ${additionalScroll}px`);

                window.scrollBy({
                    top: additionalScroll,
                    behavior: 'instant'
                });

                console.log(`[Scroll] Scrolled to block ${targetIndex}, offset ${(relativePosition * 100).toFixed(1)}% for line ${line}`);
            } else {
                // No range info, just scroll to block start
                cell.scrollIntoView({ behavior: 'instant', block: 'start' });
                console.log(`[Scroll] Scrolled to block ${targetIndex} for line ${line} (no range info)`);
            }
        } else {
            console.log(`[scrollToLine ERROR] Cell ${targetIndex} not found in DOM!`);
        }
    } else {
        console.log(`[scrollToLine ERROR] No target index found!`);
    }
}

// Setup vscode API
const vscode = acquireVsCodeApi();
window.vscode = vscode;

// Function to get current scroll position
function getCurrentScrollPercentage() {
    const scrollTop = window.scrollY || document.documentElement.scrollTop;
    const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
    return scrollHeight > 0 ? scrollTop / scrollHeight : 0;
}

// Send scroll position periodically (every second)
let scrollReportInterval = null;

function startScrollReporting() {
    if (scrollReportInterval) {
        return; // Already running
    }

    console.log('[Scroll] Starting periodic scroll reporting');
    scrollReportInterval = setInterval(() => {
        const percentage = getCurrentScrollPercentage();
        vscode.postMessage({
            command: 'scrollPosition',
            percentage: percentage
        });
    }, 1000); // Every 1 second
}

function stopScrollReporting() {
    if (scrollReportInterval) {
        console.log('[Scroll] Stopping periodic scroll reporting');
        clearInterval(scrollReportInterval);
        scrollReportInterval = null;
    }
}

// Start reporting when page loads
startScrollReporting();

// Send scroll position when requested
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'getScrollPosition') {
        const percentage = getCurrentScrollPercentage();
        vscode.postMessage({
            command: 'scrollPosition',
            percentage: percentage
        });
    }
});
