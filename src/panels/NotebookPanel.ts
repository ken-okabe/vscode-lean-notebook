import * as vscode from 'vscode';

import { parseLeanFile } from '../parser';

export class NotebookPanel {
    public static currentPanel: NotebookPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    public _document: vscode.TextDocument | undefined;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._document = document;

        // Set the webview's initial html content
        this._panel.webview.html = this._getWebviewContent(this._panel.webview);

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

    public static createOrShow(extensionUri: vscode.Uri, document: vscode.TextDocument) {
        const column = vscode.ViewColumn.Beside;

        // If we already have a panel, show it.
        if (NotebookPanel.currentPanel) {
            NotebookPanel.currentPanel._panel.reveal(column);
            NotebookPanel.currentPanel._document = document; // Switch target doc if needed?
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
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, document: vscode.TextDocument) {
        NotebookPanel.currentPanel = new NotebookPanel(panel, extensionUri, document);
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

    private _update() {
        if (!this._document) { return; }
        const webview = this._panel.webview;

        try {
            // Parse the document
            const text = this._document.getText();
            const blocks = parseLeanFile(text);

            // Fetch diagnostics (e.g. #eval results)
            const diagnostics = vscode.languages.getDiagnostics(this._document.uri);

            // Log diagnostics count for debugging
            if (diagnostics.length > 0) {
                console.log("NotebookPanel: Found " + diagnostics.length + " diagnostics.");
            }

            // Attach output to code blocks
            blocks.forEach(block => {
                if (block.type === 'code' && block.range) {
                    const startLine0 = block.range.startLine - 1;
                    const endLine0 = block.range.endLine - 1;

                    const blockDiags = diagnostics.filter(d => {
                        const l = d.range.start.line;
                        return l >= startLine0 && l <= endLine0;
                    });

                    if (blockDiags.length > 0) {
                        // Sort by line
                        blockDiags.sort((a, b) => a.range.start.line - b.range.start.line);
                        // Format
                        block.output = blockDiags.map(d => d.message).join('\n');
                    }
                }
            });

            console.log("NotebookPanel: Sending " + blocks.length + " blocks to webview.");

            // Send to webview
            webview.postMessage({ command: 'update', blocks: blocks });
        } catch (e) {
            console.error("Error in _update:", e);
        }
    }

    private _getWebviewContent(webview: vscode.Webview) {
        // Local path to main script run in the webview
        const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js');
        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

        const stylePathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css');
        const styleUri = webview.asWebviewUri(stylePathOnDisk);

        // Vendors
        const vanUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'van.min.js'));
        const markedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'marked.min.js'));
        const katexUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'katex.min.js'));
        const katexAutoRenderUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'auto-render.min.js'));
        const katexCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'katex.min.css'));


        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <link href="${katexCssUri}" rel="stylesheet">

            <script src="${markedUri}"></script>
            <script src="${katexUri}"></script>
            <script src="${katexAutoRenderUri}"></script>

            <title>Lean Notebook</title>
        </head>
        <body>
            <div id="app"></div>
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
