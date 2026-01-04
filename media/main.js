import van from './van.min.js';

// Global dependencies (marked, katex) are still loaded via global script tags for now,
// or we can treat them as globals since we aren't changing their files.
// marked and renderMathInElement are global.

const { div, pre, span, code } = van.tags;

// --- Components ---

const MarkdownComponent = (content) => {
    // 1. Convert Markdown to HTML
    const rawHtml = marked.parse(content);

    // 2. Create Wrapper
    const dom = div({ class: "markdown-cell" });
    dom.innerHTML = rawHtml;

    // 3. Render Math (KaTeX)
    // We use a small timeout to ensure DOM insertion (or use van.effect if purely functional,
    // but direct DOM mutation for libs is simpler here)
    setTimeout(() => {
        if (window.renderMathInElement) {
            renderMathInElement(dom, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false
            });
        }
    }, 0);

    return dom;
};

const CodeComponent = (source, output) => {
    return div({ class: "code-cell" },
        // Source
        pre({ class: "lean-source" }, source),
        // Output (only if present)
        output ? div({ class: "lean-output" },
            span({ class: "output-label" }, "Result:"),
            pre(output)
        ) : null
    );
};

// --- App State ---

const blocksState = van.state([]);

// --- Main App ---

const App = () => {
    return div({ class: "notebook" },
        // Reactive list rendering: pass a function that returns the children
        () => div(
            blocksState.val.map((block, index) => {
                // Keying could be improved for perf, but map is fine for now
                if (block.type === 'markdown') {
                    return MarkdownComponent(block.content);
                } else {
                    return CodeComponent(block.source, block.output);
                }
            })
        )
    );
};

// Mount
console.log("[main.js] Mounting App...");
van.add(document.getElementById("app"), App());

// --- Messaging ---

window.addEventListener('message', event => {
    const message = event.data; // The json data that the extension sent
    console.log("[main.js] Message received:", message.command);
    if (message.command === 'update') {
        // console.log("Received blocks:", message.blocks);
        blocksState.val = message.blocks;
    }
});
