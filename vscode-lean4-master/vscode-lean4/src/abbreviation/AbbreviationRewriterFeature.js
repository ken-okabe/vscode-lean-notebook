"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbbreviationRewriterFeature = void 0;
const vscode_1 = require("vscode");
const exturi_1 = require("../utils/exturi");
const VSCodeAbbreviationRewriter_1 = require("./VSCodeAbbreviationRewriter");
/**
 * Sets up everything required for the abbreviation rewriter feature.
 * Creates an `AbbreviationRewriter` for the active editor.
 */
class AbbreviationRewriterFeature {
    constructor(config, abbreviationProvider, outputChannel) {
        this.config = config;
        this.abbreviationProvider = abbreviationProvider;
        this.outputChannel = outputChannel;
        this.disposables = new Array();
        void this.changedActiveTextEditor(vscode_1.window.activeTextEditor);
        this.disposables.push(vscode_1.commands.registerTextEditorCommand('lean4.input.convert', async () => {
            if (this.activeAbbreviationRewriter === undefined) {
                return;
            }
            await this.activeAbbreviationRewriter.replaceAllTrackedAbbreviations();
        }), vscode_1.window.onDidChangeActiveTextEditor(editor => this.changedActiveTextEditor(editor)), vscode_1.workspace.onDidOpenTextDocument(async (doc) => {
            // Ensure that we create/remove abbreviation rewriters when the language ID changes
            if (vscode_1.window.activeTextEditor === undefined) {
                return;
            }
            const editorUri = (0, exturi_1.toExtUri)(vscode_1.window.activeTextEditor.document.uri);
            const docUri = (0, exturi_1.toExtUri)(doc.uri);
            if (editorUri === undefined || docUri === undefined || !(0, exturi_1.extUriEquals)(editorUri, docUri)) {
                return;
            }
            if (this.activeAbbreviationRewriter === undefined &&
                this.shouldEnableRewriterForEditor(vscode_1.window.activeTextEditor)) {
                this.activeAbbreviationRewriter = new VSCodeAbbreviationRewriter_1.VSCodeAbbreviationRewriter(config, abbreviationProvider, outputChannel, vscode_1.window.activeTextEditor);
            }
            else if (this.activeAbbreviationRewriter !== undefined &&
                !this.shouldEnableRewriterForEditor(vscode_1.window.activeTextEditor)) {
                await this.disposeActiveAbbreviationRewriter();
            }
        }));
    }
    async disposeActiveAbbreviationRewriter() {
        // This is necessary to prevent `disposeActiveAbbreviationRewriter` from racing with
        // other assignments to `this.activeAbbreviationRewriter`.
        const abbreviationRewriterToDispose = this.activeAbbreviationRewriter;
        this.activeAbbreviationRewriter = undefined;
        if (abbreviationRewriterToDispose === undefined) {
            return;
        }
        await abbreviationRewriterToDispose.replaceAllTrackedAbbreviations();
        abbreviationRewriterToDispose.dispose();
    }
    async changedActiveTextEditor(activeTextEditor) {
        await this.disposeActiveAbbreviationRewriter();
        if (activeTextEditor === undefined) {
            return;
        }
        if (!this.shouldEnableRewriterForEditor(activeTextEditor)) {
            return;
        }
        this.activeAbbreviationRewriter = new VSCodeAbbreviationRewriter_1.VSCodeAbbreviationRewriter(this.config, this.abbreviationProvider, this.outputChannel, activeTextEditor);
    }
    shouldEnableRewriterForEditor(editor) {
        if (!this.config.inputModeEnabled) {
            return false;
        }
        if (!vscode_1.languages.match(this.config.languages, editor.document)) {
            return false;
        }
        return true;
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.activeAbbreviationRewriter?.dispose();
    }
}
exports.AbbreviationRewriterFeature = AbbreviationRewriterFeature;
//# sourceMappingURL=AbbreviationRewriterFeature.js.map