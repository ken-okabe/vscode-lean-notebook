// --- Imports ---
import van from './van.min.js';

// --- VanJS Tags ---
const { div } = van.tags;

// hlLean, mdToHtml, renderBlocksSeq, parseLean etc. are provided by renderer.js
// which is loaded as a plain <script> before this module in NotebookPanel.ts.

try {
    // --- State Management ---
    const blocksState = van.state([]);

    // --- App ---
    // Uses renderBlocksSeq from renderer.js (Single Source of Truth).
    // VanJS is used only for reactive state management — when blocksState changes,
    // the notebook is re-rendered using the shared rendering function.
    const App = () => {
        const container = document.getElementById('notebook');

        // Track previous blocks for diffing (avoid full re-render when only outputs change)
        let prevBlocksJson = '';

        van.derive(() => {
            const newBlocks = blocksState.val;
            const newJson = JSON.stringify(newBlocks);

            // Skip if nothing changed
            if (newJson === prevBlocksJson) return;
            prevBlocksJson = newJson;

            container.innerHTML = '';

            renderBlocksSeq(newBlocks, container, 0, function() {
                if (window.vscode) {
                    vscode.postMessage({ command: 'renderingComplete' });
                }
            });
        });

        return container;
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
        // Simple implementation — can be enhanced later with data-line attributes.
    }

    // App() manages #notebook directly via van.derive — no return value needed.
    App();

    // Signal to extension host that main.js is ready to receive messages.
    if (vscode) {
        vscode.postMessage({ command: 'ready' });
        console.log('[main.js] Sent ready signal');
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
