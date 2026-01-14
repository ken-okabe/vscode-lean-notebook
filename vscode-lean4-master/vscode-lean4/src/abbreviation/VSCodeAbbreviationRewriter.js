"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeAbbreviationRewriter = void 0;
const unicode_input_1 = require("@leanprover/unicode-input");
const vscode_1 = require("vscode");
/**
 * Tracks abbreviations in a given text editor and replaces them when dynamically.
 */
class VSCodeAbbreviationRewriter {
    checkIsVimExtensionInstalled() {
        this.isVimExtensionInstalled = vscode_1.extensions.getExtension('vscodevim.vim') !== undefined;
    }
    constructor(config, abbreviationProvider, outputChannel, textEditor) {
        this.config = config;
        this.abbreviationProvider = abbreviationProvider;
        this.outputChannel = outputChannel;
        this.textEditor = textEditor;
        this.disposables = new Array();
        this.decorationType = vscode_1.window.createTextEditorDecorationType({
            textDecoration: 'underline',
        });
        this.firstOutput = true;
        this.isVimExtensionInstalled = false;
        this.rewriter = new unicode_input_1.AbbreviationRewriter(config, abbreviationProvider, this);
        this.disposables.push(this.decorationType);
        this.disposables.push(vscode_1.workspace.onDidChangeTextDocument(async (e) => {
            if (e.document !== this.textEditor.document) {
                return;
            }
            const changes = e.contentChanges.map(changeEvent => ({
                range: new unicode_input_1.Range(changeEvent.rangeOffset, changeEvent.rangeLength),
                newText: changeEvent.text,
            }));
            this.rewriter.changeInput(changes);
            await this.rewriter.triggerAbbreviationReplacement();
            this.updateState();
        }));
        this.disposables.push(vscode_1.window.onDidChangeTextEditorSelection(async (e) => {
            if (e.textEditor.document !== this.textEditor.document) {
                return;
            }
            const selections = e.selections.map(s => fromVsCodeRange(s, e.textEditor.document));
            await this.rewriter.changeSelections(selections);
            this.updateState();
        }));
        this.checkIsVimExtensionInstalled();
        this.disposables.push(vscode_1.extensions.onDidChange(_ => this.checkIsVimExtensionInstalled()));
    }
    writeError(e) {
        this.outputChannel.appendLine(e);
        if (this.firstOutput) {
            this.outputChannel.show(true);
            this.firstOutput = false;
        }
    }
    selectionMoveMode() {
        return { kind: 'OnlyMoveCursorSelections', updateUnchangedSelections: this.isVimExtensionInstalled };
    }
    collectSelections() {
        return this.textEditor.selections.map(s => fromVsCodeRange(s, this.textEditor.document));
    }
    setSelections(selections) {
        this.textEditor.selections = selections.map(s => {
            const vr = toVsCodeRange(s, this.textEditor.document);
            return new vscode_1.Selection(vr.start, vr.end);
        });
    }
    async replaceAbbreviations(changes) {
        let ok = false;
        let retries = 0;
        try {
            // The user may have changed the text document in-between `this.textEditor` being updated
            // (when the call to the extension was started) and `this.textEditor.edit()` being executed.
            // In this case, since the state of the editor that the extension sees and the state that
            // the user sees are different, VS Code will reject the edit.
            // This occurs especially often in setups with increased latency until the extension is triggered,
            // e.g. an SSH setup. Since VS Code does not appear to support an atomic read -> write operation,
            // unfortunately the only thing we can do here is to retry.
            while (!ok && retries < 10) {
                ok = await this.textEditor.edit(builder => {
                    for (const c of changes) {
                        builder.replace(toVsCodeRange(c.range, this.textEditor.document), c.newText);
                    }
                });
                retries++;
            }
        }
        catch (e) {
            // The 'not possible on closed editors' error naturally occurs when we attempt to replace abbreviations as the user
            // is switching away from the active tab.
            if (!(e instanceof Error) || e.message !== 'TextEditor#edit not possible on closed editors') {
                this.writeError('Error while replacing abbreviation: ' + e);
            }
        }
        return ok;
    }
    async replaceAllTrackedAbbreviations() {
        await this.rewriter.replaceAllTrackedAbbreviations();
        this.updateState();
    }
    updateState() {
        const trackedAbbreviations = this.rewriter.getTrackedAbbreviations();
        this.textEditor.setDecorations(this.decorationType, [...trackedAbbreviations].map(a => toVsCodeRange(a.range, this.textEditor.document)));
        void this.setInputActive(trackedAbbreviations.size > 0);
    }
    async setInputActive(isActive) {
        await vscode_1.commands.executeCommand('setContext', 'lean4.input.isActive', isActive);
    }
    dispose() {
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
exports.VSCodeAbbreviationRewriter = VSCodeAbbreviationRewriter;
function fromVsCodeRange(range, doc) {
    const start = doc.offsetAt(range.start);
    const end = doc.offsetAt(range.end);
    return new unicode_input_1.Range(start, end - start);
}
function toVsCodeRange(range, doc) {
    const start = doc.positionAt(range.offset);
    const end = doc.positionAt(range.offsetEnd + 1);
    return new vscode_1.Range(start, end);
}
//# sourceMappingURL=VSCodeAbbreviationRewriter.js.map