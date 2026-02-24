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

    // Pull-model state: _trySend() is the ONLY gate for postMessage('update').
    // It sends if and only if BOTH _webviewIsReady AND _currentBlocks are set.
    private _webviewIsReady = false;
    private _currentBlocks: any[] | null = null;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._document = document;

        // Set the webview's initial html content
        this._panel.webview.html = this._getWebviewContent(this._panel.webview);

        // Listen for messages from webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'ready') {
                    // Pull-model: WebView signals it's ready to receive data.
                    // Set the flag and attempt to send any blocks we already have.
                    console.log('[NotebookPanel] WebView ready signal received');
                    this._webviewIsReady = true;
                    this._trySend();
                } else if (message.command === 'scrollPosition') {
                    this._lastScrollPosition = message.percentage;
                    if (this._scrollPositionPromise) {
                        this._scrollPositionPromise(message.percentage);
                        this._scrollPositionPromise = null;
                    }
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
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Initial update — _update() stores blocks, _trySend() sends when ready
        this._update();
    }

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument, topLine?: number) {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Active;
        const scrollLine = topLine ?? 0;

        // Same file — reveal and re-render to reflect edits
        if (NotebookPanel.currentPanel &&
            NotebookPanel.currentPanel._document?.uri.toString() === document.uri.toString()) {
            NotebookPanel.currentPanel._panel.reveal(column);
            NotebookPanel.currentPanel._document = document;
            NotebookPanel.currentPanel._update();
            return;
        }

        // Different file — destroy old panel completely
        if (NotebookPanel.currentPanel) {
            NotebookPanel.currentPanel.dispose();
        }

        // Create a brand new panel
        const panel = vscode.window.createWebviewPanel(
            'leanNotebook',
            'Lean Notebook',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        NotebookPanel.currentPanel = new NotebookPanel(panel, extensionUri, document);
        NotebookPanel.currentPanel._pendingScrollLine = scrollLine;
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

    /**
     * Called from extension.ts when the document changes (file switch or diagnostic update).
     * - Different file: full re-parse (1 render).
     * - Same file: lightweight diagnostic refresh (1 render, no re-parse).
     * - During active parse: ignored entirely.
     */
    public updateDocument(document: vscode.TextDocument) {
        const sameFile = this._document?.uri.toString() === document.uri.toString();

        // During active parse, ignore ALL update requests for the same file
        if (this._isUpdating && sameFile) {
            return;
        }

        this._document = document;

        if (sameFile && this._currentBlocks !== null) {
            // Same file, blocks already exist — lightweight diagnostic refresh only
            this._refreshDiagnostics();
        } else {
            // Different file — full parse
            this._update();
        }
    }

    private _updateGeneration = 0;
    private _isUpdating = false;
    private _diagnosticTimer: ReturnType<typeof setTimeout> | null = null;

    private _trySend() {
        if (!this._webviewIsReady || this._currentBlocks === null) {
            return;
        }
        this._panel.webview.postMessage({
            command: 'update',
            blocks: this._currentBlocks,
            reset: true
        });
    }

    /**
     * Lightweight diagnostic refresh: re-attach #eval results to existing blocks
     * and send once. NO re-parse. Debounced to 500ms to coalesce burst events.
     */
    private _refreshDiagnostics() {
        if (this._diagnosticTimer) {
            clearTimeout(this._diagnosticTimer);
        }
        this._diagnosticTimer = setTimeout(async () => {
            this._diagnosticTimer = null;
            if (!this._document || !this._currentBlocks) return;

            // Dynamic import to avoid circular dependency
            const { attachDiagnostics } = await import('../lspParser');
            // Re-attach diagnostics to existing blocks (mutates in place)
            await attachDiagnostics(this._document, this._currentBlocks);
            this._trySend();
        }, 500);
    }

    /**
     * Full update: clear immediately, parse to completion, send once.
     * 2 postMessages total: clear (instant) + final blocks (after parse).
     */
    private async _update() {
        if (!this._document) { return; }

        // Invalidate previous pending updates
        const currentGen = ++this._updateGeneration;
        this._isUpdating = true;
        this._currentBlocks = null;

        try {
            const isMarkdown = this._document.languageId === 'markdown' ||
                this._document.fileName.endsWith('.md');

            let blocks: any[];

            if (isMarkdown) {
                blocks = parseMarkdownFile(this._document.getText());
            } else {
                blocks = await parseLeanFileWithLSP(this._document);
            }

            if (currentGen !== this._updateGeneration) return;

            this._currentBlocks = blocks;
            this._trySend();
        } catch (e) {
            if (currentGen !== this._updateGeneration) return;
            console.error("Error in _update:", e);
            this._currentBlocks = [];
            this._trySend();
        } finally {
            if (currentGen === this._updateGeneration) {
                this._isUpdating = false;
            }
        }

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
        const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', '_libs', 'marked.min.js'));

        // MathJax (local, from _libs/)
        const mathJaxUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', '_libs', 'mathjax', 'tex-chtml.js'));

        // Mermaid for diagrams (from _libs/)
        const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', '_libs', 'mermaid.min.js'));

        // Viz.js (Graphviz WASM, from _libs/)
        const vizUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', '_libs', 'viz-standalone.js'));

        // Read MATHJAX_CONFIG from renderer.js — single source of truth.
        const rendererJsPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'renderer.js').fsPath;
        const rendererJs = fs.readFileSync(rendererJsPath, 'utf8');
        const mathJaxConfigMatch = rendererJs.match(/const MATHJAX_CONFIG\s*=\s*(\{[\s\S]*?\});/);
        if (!mathJaxConfigMatch) { throw new Error('MATHJAX_CONFIG not found in renderer.js'); }
        // eslint-disable-next-line no-new-func
        const mathJaxConfigJson = JSON.stringify(new Function(`return ${mathJaxConfigMatch[1]}`)());

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">

            <script src="${markedUri}"></script>
            <script src="${rendererUri}"></script>
            <script>
                window.MathJax = ${mathJaxConfigJson};
            </script>
            <script id="MathJax-script" async src="${mathJaxUri}"></script>
            <script src="${mermaidUri}"></script>
            <script src="${vizUri}" async></script>

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
