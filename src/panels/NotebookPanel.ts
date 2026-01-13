import * as vscode from 'vscode';

import { parseLeanFile } from '../parser';
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

    private _update() {
        if (!this._document) { return; }
        const webview = this._panel.webview;

        try {
            // Parse the document based on file type
            const text = this._document.getText();
            const isMarkdown = this._document.languageId === 'markdown' || this._document.fileName.endsWith('.md');
            
            let blocks: any[];
            
            if (isMarkdown) {
                // Parse as Markdown
                blocks = parseMarkdownFile(text);
                console.log("NotebookPanel: Parsed Markdown with " + blocks.length + " blocks.");
            } else {
                // Parse as Lean
                blocks = parseLeanFile(text);
                
                // Fetch diagnostics (e.g. #eval results) for Lean files
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
                
                console.log("NotebookPanel: Sending " + blocks.length + " Lean blocks to webview.");
            }

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
        
        // Prism.js for syntax highlighting
        const prismJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'prism.min.js'));
        const prismLightCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'prism-github-light.css'));
        const prismDarkCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'prism-github-dark.css'));
        
        // Mermaid for diagrams
        const mermaidUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'mermaid.min.js'));


        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <link href="${katexCssUri}" rel="stylesheet">
            <link id="prism-theme-light" href="${prismLightCssUri}" rel="stylesheet" disabled>
            <link id="prism-theme-dark" href="${prismDarkCssUri}" rel="stylesheet">

            <script src="${markedUri}"></script>
            <script src="${katexUri}"></script>
            <script src="${katexAutoRenderUri}"></script>
            <script src="${prismJsUri}"></script>
            <script src="${mermaidUri}"></script>

            <title>Notebook Preview</title>
        </head>
        <body>
            <div id="app"></div>
            <script>
                console.log("[Webview] HTML loaded.");
                
                // Detect VS Code theme and switch Prism theme accordingly
                function updatePrismTheme() {
                    const bodyStyle = getComputedStyle(document.body);
                    const bgColor = bodyStyle.backgroundColor;
                    
                    // Parse RGB to determine if it's dark or light
                    const rgb = bgColor.match(/\\d+/g);
                    let isDark = true; // default to dark
                    
                    if (rgb) {
                        const brightness = (parseInt(rgb[0]) * 299 + parseInt(rgb[1]) * 587 + parseInt(rgb[2]) * 114) / 1000;
                        isDark = brightness < 128;
                    }
                    
                    const lightTheme = document.getElementById('prism-theme-light');
                    const darkTheme = document.getElementById('prism-theme-dark');
                    
                    if (isDark) {
                        lightTheme.disabled = true;
                        darkTheme.disabled = false;
                        console.log('[Prism] Dark theme activated');
                    } else {
                        lightTheme.disabled = false;
                        darkTheme.disabled = true;
                        console.log('[Prism] Light theme activated');
                    }
                }
                
                // Update theme on load
                updatePrismTheme();
                
                // Watch for theme changes
                const observer = new MutationObserver(updatePrismTheme);
                observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
                
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
