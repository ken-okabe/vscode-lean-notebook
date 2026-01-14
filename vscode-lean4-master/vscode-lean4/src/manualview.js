"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualView = void 0;
const fs_1 = require("fs");
const markdown_it_1 = require("markdown-it");
const markdown_it_anchor_1 = require("markdown-it-anchor");
const vscode_1 = require("vscode");
const exturi_1 = require("./utils/exturi");
const viewColumn_1 = require("./utils/viewColumn");
class ManualView {
    constructor(extensionPath, manualFile) {
        this.subscriptions = [];
        this.extensionPath = extensionPath;
        this.manualFile = manualFile;
        this.subscriptions.push(vscode_1.commands.registerCommand('lean4.docs.showExtensionManual', () => this.displayManual()));
    }
    async displayManual() {
        if (this.webviewPanel !== undefined) {
            this.webviewPanel.reveal();
            return;
        }
        this.webviewPanel = vscode_1.window.createWebviewPanel('lean4_manualview', 'Lean 4 VS Code Extension Manual', { viewColumn: (0, viewColumn_1.viewColumnOfActiveTextEditor)() }, {
            enableFindWidget: true,
            enableCommandUris: true,
            retainContextWhenHidden: true,
        });
        this.webviewPanel.onDidDispose(() => {
            this.webviewPanel = undefined;
        });
        const manualContents = await fs_1.promises.readFile(this.manualFile.fsPath, 'utf8');
        const md = (0, markdown_it_1.default)({ breaks: true, html: true });
        const proxy = (tokens, idx, options, _, self) => self.renderToken(tokens, idx, options);
        // Center all tables.
        const defaultTableOpenRenderer = md.renderer.rules.table_open ?? proxy;
        md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
            return `<center>${defaultTableOpenRenderer(tokens, idx, options, env, self)}`;
        };
        const defaultTableCloseRenderer = md.renderer.rules.table_close ?? proxy;
        md.renderer.rules.table_close = (tokens, idx, options, env, self) => {
            return `${defaultTableCloseRenderer(tokens, idx, options, env, self)}</center>`;
        };
        // Scale all images to at most 70% so that they don't take up too much space.
        const defaultImageRenderer = md.renderer.rules.image ?? proxy;
        md.renderer.rules.image = (tokens, idx, options, env, self) => {
            tokens[idx].attrSet('style', 'max-width: 70%');
            return defaultImageRenderer(tokens, idx, options, env, self);
        };
        // In order to render local resources in VS Code webviews, local file URIs
        // first need to be converted to a webview URI with the correct authority
        // using `Webview.asWebviewUri`. This function converts all file URLs to
        // webview URIs.
        md.normalizeLink = url => {
            if (this.webviewPanel === undefined) {
                return url;
            }
            if (url.startsWith('#') || url.startsWith('command:')) {
                return url;
            }
            // `Uri.parse` defaults to a scheme of `file://` for URIs without a scheme
            const uri = exturi_1.FileUri.fromUri(vscode_1.Uri.parse(url, false));
            if (uri === undefined) {
                return url;
            }
            const resourceUri = this.extensionPath.join('manual', uri.fsPath).asUri();
            const webviewResourceUri = this.webviewPanel.webview.asWebviewUri(resourceUri);
            return webviewResourceUri.toString();
        };
        this.webviewPanel.webview.html = md.use(markdown_it_anchor_1.default).render(manualContents);
        this.webviewPanel.reveal();
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.ManualView = ManualView;
//# sourceMappingURL=manualview.js.map