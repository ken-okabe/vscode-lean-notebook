import * as vscode from 'vscode';
import * as fs from 'fs';

import { parseLeanFileWithLSP } from '../lspParser';
import { parseMarkdownFile } from '../markdownParser';

export class NotebookPanel {
    public static currentPanel: NotebookPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    public _document: vscode.TextDocument | undefined;

    private _lastScrollPosition: number = 0;
    private _scrollPositionPromise: ((value: number) => void) | null = null;
    private _renderingCompletePromise: ((value: void) => void) | null = null;
    private _pendingScrollLine: number | null = null;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._document = document;

        // Set the webview's initial html content
        this._panel.webview.html = this._getWebviewContent(this._panel.webview);

        // Listen for messages from webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'scrollPosition') {
                    this._lastScrollPosition = message.percentage;
                    if (this._scrollPositionPromise) {
                        this._scrollPositionPromise(message.percentage);
                        this._scrollPositionPromise = null;
                    }
                    // Don't log every second to avoid spam
                    // console.log(`[NotebookPanel] Received scroll position: ${message.percentage}`);
                } else if (message.command === 'renderingComplete') {
                    console.log('[NotebookPanel] Rendering complete notification received');
                    if (this._renderingCompletePromise) {
                        this._renderingCompletePromise();
                        this._renderingCompletePromise = null;
                    }
                    // If there's a pending scroll, execute it now
                    if (this._pendingScrollLine !== null) {
                        const lineToScroll = this._pendingScrollLine;
                        this._pendingScrollLine = null;
                        console.log(`[NotebookPanel] Executing pending scroll to line ${lineToScroll}`);
                        this._panel.webview.postMessage({
                            command: 'scrollToLine',
                            line: lineToScroll
                        });
                    }
                }
            },
            null,
            this._disposables
        );

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Update the content based on view state changes
        this._panel.onDidChangeViewState(
            e => {
                if (this._panel.visible) {
                    this._update();
                }
            },
            null,
            this._disposables
        );

        // Initial update
        this._update();
    }

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument, topLine?: number) {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;

        // Use provided topLine or try to get from active editor
        let scrollLine = topLine ?? 0;
        if (scrollLine === undefined || scrollLine === null) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.uri.toString() === document.uri.toString()) {
                scrollLine = editor.visibleRanges[0]?.start.line || 0;
                console.log(`[createOrShow] Got scroll from active editor: line ${scrollLine}`);
            } else {
                scrollLine = 0;
                console.log(`[createOrShow] No editor or URI mismatch, using line 0`);
            }
        } else {
            console.log(`[createOrShow] Using provided scroll position: line ${scrollLine}`);
        }

        // If we already have a panel, show it.
        if (NotebookPanel.currentPanel) {
            NotebookPanel.currentPanel._panel.reveal(column);
            NotebookPanel.currentPanel._document = document;

            // Store the pending scroll line
            NotebookPanel.currentPanel._pendingScrollLine = scrollLine;
            console.log(`[createOrShow] Stored pending scroll to line ${scrollLine}`);

            // Update - rendering complete handler will execute the scroll
            NotebookPanel.currentPanel._update();

            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            'leanNotebook',
            'Lean Notebook',
            column,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        NotebookPanel.currentPanel = new NotebookPanel(panel, extensionUri, document);

        // Store the pending scroll line - rendering complete handler will execute it
        NotebookPanel.currentPanel._pendingScrollLine = scrollLine;
        console.log(`[createOrShow] Stored initial scroll to line ${scrollLine} for new panel`);
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        NotebookPanel.currentPanel = new NotebookPanel(panel, extensionUri, document);
    }

    public async getScrollPosition(): Promise<number> {
        return new Promise((resolve) => {
            this._scrollPositionPromise = resolve;
            this._panel.webview.postMessage({ command: 'getScrollPosition' });

            // Timeout after 500ms
            setTimeout(() => {
                if (this._scrollPositionPromise) {
                    resolve(this._lastScrollPosition);
                    this._scrollPositionPromise = null;
                }
            }, 500);
        });
    }

    public getLastScrollPosition(): number {
        return this._lastScrollPosition;
    }

    public dispose() {
        NotebookPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    public updateDocument(document: vscode.TextDocument) {
        this._document = document;
        this._update();
    }

    private _updateGeneration = 0;

    private async _update() {
        if (!this._document) { return; }
        const webview = this._panel.webview;

        // Increment generation to invalidate previous pending updates
        const currentGen = ++this._updateGeneration;

        try {
            // Parse the document based on file type
            const isMarkdown = this._document.languageId === 'markdown' || this._document.fileName.endsWith('.md');

            let blocks: any[];

            if (isMarkdown) {
                // Parse as Markdown
                const text = this._document.getText();
                blocks = parseMarkdownFile(text);

                if (currentGen !== this._updateGeneration) return;
                console.log("NotebookPanel: Parsed Markdown with " + blocks.length + " blocks.");
                webview.postMessage({ command: 'update', blocks: blocks, reset: true });
            } else {
                // Parse as Lean:
                // - structural split is a textual scan (see `splitLeanDocComments`)
                // - #eval results are attached via Lean server diagnostics
                console.log("NotebookPanel: Parsing Lean file (lexical split + diagnostics)...");

                // Use the onUpdate callback to stream initial blocks immediately
                blocks = await parseLeanFileWithLSP(this._document, (partialBlocks) => {
                    if (currentGen !== this._updateGeneration) return;
                    console.log(`[NotebookPanel] Received partial update with ${partialBlocks.length} blocks`);
                    // For partial updates, we might NOT want to reset if we already sent the first chunk?
                    // Actually, the first chunk defined the "new file" state. 
                    // Let's say: First partial update = reset: true. Subsequent = reset: false?
                    // But here we rely on the fact that we are overwriting the whole state anyway.
                    // Ideally, we send 'reset: true' only on the very first message for this document.
                    // But since we send the *complete* list of blocks every time in 'partialBlocks', 
                    // 'reset: true' is safe (it just clears the DOM cache).
                    webview.postMessage({ command: 'update', blocks: partialBlocks, reset: true });
                });

                if (currentGen !== this._updateGeneration) return;
                console.log("NotebookPanel: Parsed " + blocks.length + " blocks (final).");
                webview.postMessage({ command: 'update', blocks: blocks, reset: true });

                // Note: Diagnostics are already attached by the notebook parser
            }
        } catch (e) {
            if (currentGen !== this._updateGeneration) return;
            console.error("Error in _update:", e);
            // No fallback: if LSP parsing fails, send an empty update.
            webview.postMessage({ command: 'update', blocks: [], reset: true });
        }

        // Update Title
        const fileName = this._document.fileName.split(/[/\\]/).pop() || 'Notebook';
        this._panel.title = fileName;
    }

    private _getWebviewContent(webview: vscode.Webview) {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        const stylePathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css');
        const styleUri = webview.asWebviewUri(stylePathOnDisk);

        // Shared renderer (must be loaded before main.js)
        const rendererUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'renderer.js'));

        // Vendors
        const vanUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'van.min.js'));
        const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'marked.min.js'));

        // Mermaid for diagrams
        const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'mermaid.min.js'));

        // Viz.js (Graphviz WASM) for DOT diagrams
        const vizUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'viz-global.js'));

        // Read MATHJAX_CONFIG from renderer.js — single source of truth.
        // renderer.js is loaded as a <script> tag, so MATHJAX_CONFIG is available at runtime.
        // But MathJax CDN must see the config BEFORE it loads, so we inject it here as JSON.
        const rendererJsPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'renderer.js').fsPath;
        const rendererJs = fs.readFileSync(rendererJsPath, 'utf8');

        // Extract MATHJAX_CONFIG — single source of truth in renderer.js.
        const mathJaxConfigMatch = rendererJs.match(/const MATHJAX_CONFIG\s*=\s*(\{[\s\S]*?\});/);
        if (!mathJaxConfigMatch) { throw new Error('MATHJAX_CONFIG not found in renderer.js'); }
        // eslint-disable-next-line no-new-func
        const mathJaxConfigJson = JSON.stringify(new Function(`return ${mathJaxConfigMatch[1]}`)());

        // Extract MATHJAX_CDN_URL — single source of truth in renderer.js.
        const mathJaxCdnMatch = rendererJs.match(/const MATHJAX_CDN_URL\s*=\s*'([^']+)'/);
        if (!mathJaxCdnMatch) { throw new Error('MATHJAX_CDN_URL not found in renderer.js'); }
        const mathJaxCdnUrl = mathJaxCdnMatch[1];

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">

            <script src="${markedUri}"></script>
            <script src="${rendererUri}"></script>
            <script>
                // MathJax config — extracted from MATHJAX_CONFIG in renderer.js at load time.
                // Do NOT edit here. Edit MATHJAX_CONFIG in renderer.js instead.
                window.MathJax = ${mathJaxConfigJson};
            </script>
            <script id="MathJax-script" async src="${mathJaxCdnUrl}"></script>
            <script src="${mermaidUri}"></script>
            <script src="${vizUri}"></script>

            <title>Notebook Preview</title>
        </head>
        <body>
            <div id="app">
                <nav id="sidebar">
                    <div id="toc-label">Contents</div>
                    <div id="toc"></div>
                </nav>
                <main id="notebook"></main>
            </div>
            <script>
                console.log("[Webview] HTML loaded.");
                
                window.addEventListener('error', function(event) {
                    console.error("[Webview Error]", event.message, event.filename, event.lineno);
                });
                window.addEventListener('message', event => {
                     console.log("[Webview] Raw Message received:", event.data);
                });
            </script>
            <script type="module" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}
