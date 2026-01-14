"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoogleView = void 0;
const vscode_1 = require("vscode");
const VSCodeAbbreviationConfig_1 = require("./abbreviation/VSCodeAbbreviationConfig");
const viewColumn_1 = require("./utils/viewColumn");
function escapeHtml(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
class LoogleView {
    constructor(extensionPath, extensionVersion) {
        this.extensionPath = extensionPath;
        this.extensionVersion = extensionVersion;
        this.subscriptions = [];
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.loogle.search', async () => this.search()));
    }
    async search() {
        let initialQuery;
        if (vscode_1.window.activeTextEditor !== undefined && vscode_1.window.activeTextEditor.selection !== undefined) {
            initialQuery = vscode_1.window.activeTextEditor.document.getText(vscode_1.window.activeTextEditor.selection);
        }
        await this.display(initialQuery);
    }
    async display(initialQuery) {
        const webviewPanel = vscode_1.window.createWebviewPanel('lean4_loogleview', 'LoogleView', { viewColumn: (0, viewColumn_1.viewColumnOfInfoView)() }, {
            enableScripts: true,
            enableFindWidget: true,
            retainContextWhenHidden: true,
            enableCommandUris: true,
        });
        webviewPanel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8" />
                <meta http-equiv="Content-type" content="text/html;charset=utf-8">
                <meta
                    http-equiv="Content-Security-Policy"
                    content="
                        default-src ${webviewPanel.webview.cspSource} https://loogle.lean-lang.org;
                        script-src ${webviewPanel.webview.cspSource} 'nonce-inline';
                        style-src ${webviewPanel.webview.cspSource} 'unsafe-inline'"
                />
                <title>LoogleView</title>
                <script
                    src="${this.webviewUri(webviewPanel, 'dist', 'loogleview', 'static', 'elements', 'bundled.js')}"
                    type="module"
                ></script>
                <script defer type="module" nonce="inline">
                    document.getElementById("loogleviewRoot").innerHTML = await (await fetch("${this.webviewUri(webviewPanel, 'dist', 'loogleview', 'static', 'index.html')}")).text()
                </script>
                <link rel="stylesheet" href="${this.webviewUri(webviewPanel, 'dist', 'loogleview', 'static', 'index.css')}">
                <link rel="stylesheet" id="vscode-codicon-stylesheet" href="${this.webviewUri(webviewPanel, 'dist', 'loogleview', 'static', 'codicons', 'codicon.css')}">
            </head>
            <body>
                <div id="loogleviewRoot" style="min-width: 50em"></div>
                <script defer
                    nonce="inline"
                    src="${this.webviewUri(webviewPanel, 'dist/loogleview.js')}"
                    data-id="loogleview-script"
                    abbreviation-config="${escapeHtml(JSON.stringify(new VSCodeAbbreviationConfig_1.VSCodeAbbreviationConfig()))}"
                    initial-query="${escapeHtml(initialQuery ?? '')}"
                    vscode-version="${escapeHtml(vscode_1.version)}"
                    extension-version="${escapeHtml(this.extensionVersion)}"></script>
            </body>
            </html>`;
        webviewPanel.reveal();
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
exports.LoogleView = LoogleView;
//# sourceMappingURL=loogleview.js.map