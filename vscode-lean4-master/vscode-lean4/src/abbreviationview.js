"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbbreviationView = void 0;
const vscode_1 = require("vscode");
const viewColumn_1 = require("./utils/viewColumn");
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
class AbbreviationView {
    constructor(extensionPath, abbreviationProvider) {
        this.extensionPath = extensionPath;
        this.abbreviationProvider = abbreviationProvider;
        this.subscriptions = [];
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.docs.showAbbreviations', () => this.display()));
    }
    async display() {
        if (this.webviewPanel) {
            this.webviewPanel.reveal();
        }
        this.webviewPanel = vscode_1.window.createWebviewPanel('lean4_abbreviationview', 'AbbreviationView', { viewColumn: (0, viewColumn_1.viewColumnOfInfoView)() }, {
            enableScripts: true,
            enableFindWidget: true,
            retainContextWhenHidden: true,
        });
        this.webviewPanel.onDidDispose(() => {
            this.webviewPanel = undefined;
        });
        const leader = this.abbreviationProvider.config.abbreviationCharacter;
        const abbreviations = Object.entries(this.abbreviationProvider.getSymbolsByAbbreviation()).map(([abbreviation, symbol]) => ({ Abbreviation: leader + abbreviation, 'Unicode symbol': symbol }));
        this.webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="Content-type" content="text/html;charset=utf-8">
                <title>AbbreviationView</title>
                <script
                    src="${this.webviewUri(this.webviewPanel, 'dist', 'abbreviationview', 'static', 'elements', 'bundled.js')}"
                    type="module"
                ></script>
                <script defer data-id="abbreviationview-script" src="${this.webviewUri(this.webviewPanel, 'dist/abbreviationview.js')}" abbreviations="${escapeHtml(JSON.stringify(abbreviations))}"></script>
            </head>
            <body>
                <vscode-table aria-label="Abbreviations" responsive resizable bordered zebra>
                    <vscode-table-header slot="header">
                        <vscode-table-header-cell>Abbreviation</vscode-table-header-cell>
                        <vscode-table-header-cell>Unicode symbol</vscode-table-header-cell>
                    </vscode-table-header>
                    <vscode-table-body id="abbreviation-table" slot="body">
                    </vscode-table-body>
                </vscode-table>
            </body>
            </html>`;
        this.webviewPanel.reveal();
    }
    webviewUri(webviewPanel, ...pathSegments) {
        const uri = webviewPanel.webview.asWebviewUri(this.extensionPath.join(...pathSegments).asUri());
        return uri.toString();
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.AbbreviationView = AbbreviationView;
//# sourceMappingURL=abbreviationview.js.map