"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.text = exports.lean = exports.LeanEditorProvider = exports.LeanEditor = exports.LeanDocument = void 0;
exports.registerLeanEditorProviders = registerLeanEditorProviders;
const vscode_1 = require("vscode");
const exturi_1 = require("./exturi");
const groupBy_1 = require("./groupBy");
class LeanDocument {
    constructor(doc, extUri) {
        this.doc = doc;
        this.extUri = extUri;
    }
    equals(other) {
        return this.doc === other.doc;
    }
    equalsTextDocument(other) {
        return this.doc === other;
    }
    static equalsWithUndefined(a, b) {
        if (a === undefined) {
            return b === undefined;
        }
        if (b === undefined) {
            return a === undefined;
        }
        return a.equals(b);
    }
}
exports.LeanDocument = LeanDocument;
class LeanEditor {
    constructor(editor, documentExtUri) {
        this.editor = editor;
        this.documentExtUri = documentExtUri;
    }
    equals(other) {
        return this.editor === other.editor;
    }
    equalsTextEditor(other) {
        return this.editor === other;
    }
    static equalsWithUndefined(a, b) {
        if (a === undefined) {
            return b === undefined;
        }
        if (b === undefined) {
            return a === undefined;
        }
        return a.equals(b);
    }
}
exports.LeanEditor = LeanEditor;
class LeanDocumentIndex {
    /**
     * Assumes that `docs` only contains at most one `LeanDocument` per URI.
     * This is given for `TextDocument`s from VS Code.
     * */
    constructor(docs) {
        this.docsByUri = (0, groupBy_1.groupByUniqueKey)(docs, doc => doc.extUri.toString());
    }
    get(uri) {
        return this.docsByUri.get(uri.toString());
    }
}
class LeanEditorIndex {
    constructor(editors) {
        this.editorsByUri = (0, groupBy_1.groupByKey)(editors, editor => editor.documentExtUri.toString());
    }
    get(uri) {
        return this.editorsByUri.get(uri.toString());
    }
}
class LeanEditorProvider {
    constructor(mode) {
        this.subscriptions = [];
        this.onDidChangeVisibleLeanEditorsEmitter = new vscode_1.EventEmitter();
        this.onDidChangeVisibleLeanEditors = this.onDidChangeVisibleLeanEditorsEmitter.event;
        this.onDidChangeActiveLeanEditorEmitter = new vscode_1.EventEmitter();
        this.onDidChangeActiveLeanEditor = this.onDidChangeActiveLeanEditorEmitter.event;
        this.onDidChangeLastActiveLeanEditorEmitter = new vscode_1.EventEmitter();
        this.onDidChangeLastActiveLeanEditor = this.onDidChangeLastActiveLeanEditorEmitter.event;
        this.onDidChangeLeanDocumentsEmitter = new vscode_1.EventEmitter();
        this.onDidChangeLeanDocuments = this.onDidChangeLeanDocumentsEmitter.event;
        this.onDidOpenLeanDocumentEmitter = new vscode_1.EventEmitter();
        this.onDidOpenLeanDocument = this.onDidOpenLeanDocumentEmitter.event;
        this.onDidCloseLeanDocumentEmitter = new vscode_1.EventEmitter();
        this.onDidCloseLeanDocument = this.onDidCloseLeanDocumentEmitter.event;
        this.onDidChangeLastActiveLeanDocumentEmitter = new vscode_1.EventEmitter();
        this.onDidChangeLastActiveLeanDocument = this.onDidChangeLastActiveLeanDocumentEmitter.event;
        this.onDidRevealLeanEditorEmitter = new vscode_1.EventEmitter();
        this.onDidRevealLeanEditor = this.onDidRevealLeanEditorEmitter.event;
        this.onDidConcealLeanEditorEmitter = new vscode_1.EventEmitter();
        this.onDidConcealLeanEditor = this.onDidConcealLeanEditorEmitter.event;
        this.onDidChangeLeanDocumentEmitter = new vscode_1.EventEmitter();
        this.onDidChangeLeanDocument = this.onDidChangeLeanDocumentsEmitter.event;
        this.onDidChangeLeanEditorSelectionEmitter = new vscode_1.EventEmitter();
        this.onDidChangeLeanEditorSelection = this.onDidChangeLeanEditorSelectionEmitter.event;
        this.mode = mode;
        this._visibleLeanEditors = this.filterLeanEditors(vscode_1.window.visibleTextEditors);
        this.visibleLeanEditorsByUri = new LeanEditorIndex(this._visibleLeanEditors);
        this.subscriptions.push(vscode_1.window.onDidChangeVisibleTextEditors(editors => this.updateVisibleTextEditors(editors)));
        this._activeLeanEditor = this.filterLeanEditor(vscode_1.window.activeTextEditor);
        this._lastActiveLeanEditor = this.filterLeanEditor(vscode_1.window.activeTextEditor);
        this._lastActiveLeanDocument = this.filterLeanDocument(vscode_1.window.activeTextEditor?.document);
        this.subscriptions.push(vscode_1.window.onDidChangeActiveTextEditor(editor => this.updateActiveTextEditor(editor)));
        this._leanDocuments = this.filterLeanDocuments(vscode_1.workspace.textDocuments);
        this.leanDocumentsByUri = new LeanDocumentIndex(this._leanDocuments);
        this.subscriptions.push(vscode_1.workspace.onDidOpenTextDocument(doc => {
            this.updateLeanDocuments(vscode_1.workspace.textDocuments);
            this.openLeanDocument(doc);
            // Update visible and active editors in case this `onDidOpenTextDocument` call was
            // triggered by a changed language ID.
            this.updateVisibleTextEditors(vscode_1.window.visibleTextEditors);
            this.updateActiveTextEditor(vscode_1.window.activeTextEditor);
        }));
        this.subscriptions.push(vscode_1.workspace.onDidCloseTextDocument(doc => {
            // Update visible and active editors in case this `onDidCloseTextDocument` call was
            // triggered by a changed language ID.
            this.updateVisibleTextEditors(vscode_1.window.visibleTextEditors);
            this.updateActiveTextEditor(vscode_1.window.activeTextEditor);
            this.updateLeanDocuments(vscode_1.workspace.textDocuments);
            this.closeLeanDocument(doc);
            this.invalidateClosedLastActiveLeanDocument(doc);
        }));
        this.subscriptions.push(vscode_1.workspace.onDidChangeTextDocument(event => this.updateDocument(event)));
        this.subscriptions.push(vscode_1.window.onDidChangeTextEditorSelection(event => this.updateTextEditorSelection(event)));
    }
    updateVisibleTextEditors(visibleTextEditors) {
        const oldVisibleLeanEditors = [...this._visibleLeanEditors];
        this.updateVisibleLeanEditors(visibleTextEditors);
        this.invalidateInvisibleLastActiveLeanEditor(visibleTextEditors);
        this.revealLeanEditors(oldVisibleLeanEditors, visibleTextEditors);
        this.concealLeanEditors(oldVisibleLeanEditors, visibleTextEditors);
    }
    updateActiveTextEditor(activeTextEditor) {
        this.updateActiveLeanEditor(activeTextEditor);
        this.updateLastActiveLeanEditor(activeTextEditor);
        this.updateLastActiveLeanDocument(activeTextEditor);
    }
    updateVisibleLeanEditors(visibleTextEditors) {
        const newVisibleLeanEditors = this.filterLeanEditors(visibleTextEditors);
        if (newVisibleLeanEditors.length === this._visibleLeanEditors.length &&
            newVisibleLeanEditors.every((newVisibleLeanEditor, i) => newVisibleLeanEditor.equals(this._visibleLeanEditors[i]))) {
            return;
        }
        this._visibleLeanEditors = newVisibleLeanEditors;
        this.visibleLeanEditorsByUri = new LeanEditorIndex(newVisibleLeanEditors);
        this.onDidChangeVisibleLeanEditorsEmitter.fire(newVisibleLeanEditors);
    }
    revealLeanEditors(oldVisibleLeanEditors, newVisibleTextEditors) {
        const oldVisibleLeanEditorsIndex = new Set(oldVisibleLeanEditors.map(leanEditor => leanEditor.editor));
        const newVisibleLeanEditors = this.filterLeanEditors(newVisibleTextEditors);
        const revealedLeanEditors = newVisibleLeanEditors.filter(newVisibleLeanEditor => !oldVisibleLeanEditorsIndex.has(newVisibleLeanEditor.editor));
        for (const revealedLeanEditor of revealedLeanEditors) {
            this.onDidRevealLeanEditorEmitter.fire(revealedLeanEditor);
        }
    }
    concealLeanEditors(oldVisibleLeanEditors, newVisibleTextEditors) {
        const newVisibleLeanEditors = this.filterLeanEditors(newVisibleTextEditors);
        const newVisibleLeanEditorsIndex = new Set(newVisibleLeanEditors.map(leanEditor => leanEditor.editor));
        const concealedLeanEditors = oldVisibleLeanEditors.filter(newVisibleLeanEditor => !newVisibleLeanEditorsIndex.has(newVisibleLeanEditor.editor));
        for (const concealedLeanEditor of concealedLeanEditors) {
            this.onDidConcealLeanEditorEmitter.fire(concealedLeanEditor);
        }
    }
    updateActiveLeanEditor(activeTextEditor) {
        const newActiveLeanEditor = this.filterLeanEditor(activeTextEditor);
        if (LeanEditor.equalsWithUndefined(newActiveLeanEditor, this._activeLeanEditor)) {
            return;
        }
        this._activeLeanEditor = newActiveLeanEditor;
        this.onDidChangeActiveLeanEditorEmitter.fire(newActiveLeanEditor);
    }
    invalidateInvisibleLastActiveLeanEditor(visibleTextEditors) {
        if (this._lastActiveLeanEditor !== undefined &&
            !visibleTextEditors.includes(this._lastActiveLeanEditor.editor)) {
            this._lastActiveLeanEditor = undefined;
            this.onDidChangeLastActiveLeanEditorEmitter.fire(undefined);
        }
    }
    updateLastActiveLeanEditor(activeTextEditor) {
        const newLastActiveLeanEditor = this.filterLeanEditor(activeTextEditor);
        if (newLastActiveLeanEditor === undefined) {
            return;
        }
        if (LeanEditor.equalsWithUndefined(newLastActiveLeanEditor, this._lastActiveLeanEditor)) {
            return;
        }
        this._lastActiveLeanEditor = newLastActiveLeanEditor;
        this.onDidChangeLastActiveLeanEditorEmitter.fire(newLastActiveLeanEditor);
    }
    updateLeanDocuments(textDocuments) {
        const newLeanDocuments = this.filterLeanDocuments(textDocuments);
        if (newLeanDocuments.length === this._leanDocuments.length &&
            newLeanDocuments.every((newLeanDocument, i) => newLeanDocument.equals(this._leanDocuments[i]))) {
            return;
        }
        this._leanDocuments = newLeanDocuments;
        this.leanDocumentsByUri = new LeanDocumentIndex(newLeanDocuments);
        this.onDidChangeLeanDocumentsEmitter.fire(newLeanDocuments);
    }
    openLeanDocument(textDocument) {
        const leanTextDocument = this.filterLeanDocument(textDocument);
        if (leanTextDocument === undefined) {
            return;
        }
        this.onDidOpenLeanDocumentEmitter.fire(leanTextDocument);
    }
    closeLeanDocument(textDocument) {
        const leanTextDocument = this.filterLeanDocument(textDocument);
        if (leanTextDocument === undefined) {
            return;
        }
        this.onDidCloseLeanDocumentEmitter.fire(leanTextDocument);
    }
    invalidateClosedLastActiveLeanDocument(closedTextDocument) {
        if (this._lastActiveLeanDocument?.doc === closedTextDocument) {
            this._lastActiveLeanDocument = undefined;
            this.onDidChangeLastActiveLeanDocumentEmitter.fire(undefined);
        }
    }
    updateLastActiveLeanDocument(activeTextEditor) {
        const newLastActiveLeanDocument = this.filterLeanDocument(activeTextEditor?.document);
        if (newLastActiveLeanDocument === undefined) {
            return;
        }
        if (LeanDocument.equalsWithUndefined(newLastActiveLeanDocument, this._lastActiveLeanDocument)) {
            return;
        }
        this._lastActiveLeanDocument = newLastActiveLeanDocument;
        this.onDidChangeLastActiveLeanDocumentEmitter.fire(newLastActiveLeanDocument);
    }
    updateDocument(event) {
        if (!this.isLeanDocument(event.document)) {
            return;
        }
        this.onDidChangeLeanDocumentEmitter.fire(event);
    }
    updateTextEditorSelection(event) {
        if (!this.isLeanEditor(event.textEditor)) {
            return;
        }
        this.onDidChangeLeanEditorSelectionEmitter.fire(event);
    }
    isLeanDocument(doc) {
        switch (this.mode) {
            case 'Lean':
                return (0, exturi_1.isExtUri)(doc.uri) && doc.languageId === 'lean4';
            case 'Text':
                return (0, exturi_1.isExtUri)(doc.uri);
        }
    }
    asLeanDocument(doc) {
        if (this.isLeanDocument(doc)) {
            return new LeanDocument(doc, (0, exturi_1.toExtUriOrError)(doc.uri));
        }
        return undefined;
    }
    filterLeanDocuments(docs) {
        return docs.map(doc => this.asLeanDocument(doc)).filter(doc => doc !== undefined);
    }
    filterLeanDocument(doc) {
        if (doc === undefined) {
            return undefined;
        }
        return this.asLeanDocument(doc);
    }
    isLeanEditor(editor) {
        return this.isLeanDocument(editor.document);
    }
    asLeanEditor(editor) {
        if (this.isLeanEditor(editor)) {
            return new LeanEditor(editor, (0, exturi_1.toExtUriOrError)(editor.document.uri));
        }
        return undefined;
    }
    filterLeanEditors(editors) {
        return editors.map(editor => this.asLeanEditor(editor)).filter(editor => editor !== undefined);
    }
    filterLeanEditor(editor) {
        if (editor === undefined) {
            return undefined;
        }
        return this.asLeanEditor(editor);
    }
    get visibleLeanEditors() {
        return this._visibleLeanEditors;
    }
    get activeLeanEditor() {
        return this._activeLeanEditor;
    }
    get lastActiveLeanEditor() {
        return this._lastActiveLeanEditor;
    }
    get leanDocuments() {
        return this._leanDocuments;
    }
    get lastActiveLeanDocument() {
        return this._lastActiveLeanDocument;
    }
    getVisibleLeanEditorsByUri(uri) {
        return this.visibleLeanEditorsByUri.get(uri) ?? [];
    }
    getLeanDocumentByUri(uri) {
        return this.leanDocumentsByUri.get(uri);
    }
    registerLeanEditorCommand(command, callback, thisArg) {
        return vscode_1.commands.registerTextEditorCommand(command, (editor, edit, ...args) => {
            const leanEditor = this.filterLeanEditor(editor);
            if (leanEditor === undefined) {
                return;
            }
            callback(leanEditor, edit, ...args);
        }, thisArg);
    }
    dispose() {
        for (const s of this.subscriptions) {
            s.dispose();
        }
    }
}
exports.LeanEditorProvider = LeanEditorProvider;
/** Must be called at the very start when the extension is activated so that `lean` is defined. */
function registerLeanEditorProviders(context) {
    exports.lean = new LeanEditorProvider('Lean');
    exports.text = new LeanEditorProvider('Text');
    context.subscriptions.push(exports.lean);
    context.subscriptions.push(exports.text);
    context.subscriptions.push({
        dispose: () => {
            const u = undefined;
            // Implicit invariant: When the extension deactivates, `lean` and `text` are not called after these assignments.
            exports.lean = u;
            exports.text = u;
        },
    });
}
//# sourceMappingURL=leanEditorProvider.js.map