import * as vscode from 'vscode';
import { NotebookPanel } from './panels/NotebookPanel';

export function activate(context: vscode.ExtensionContext) {

    // Command to open the notebook preview
    let disposable = vscode.commands.registerCommand('leannotebook.openPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && (editor.document.languageId === 'lean4' || editor.document.fileName.endsWith('.lean'))) {
            NotebookPanel.createOrShow(context.extensionUri, editor.document);
        } else {
            vscode.window.showErrorMessage("Active editor is not a Lean 4 file. (LangId: " + editor?.document.languageId + ")");
        }
    });

    context.subscriptions.push(disposable);


    // Listen for diagnostic changes (e.g. #eval results arriving)
    vscode.languages.onDidChangeDiagnostics(e => {
        try {
            if (NotebookPanel.currentPanel && NotebookPanel.currentPanel._document) {
                // Check if the event affects the current document
                if (e.uris.some(uri => uri.toString() === NotebookPanel.currentPanel!._document!.uri.toString())) {
                    console.log("LeanNotebook: Diagnostics changed for current doc.");
                    NotebookPanel.currentPanel.updateDocument(NotebookPanel.currentPanel._document);
                }
            }
        } catch (error) {
            console.error("Error in onDidChangeDiagnostics:", error);
        }
    }, null, context.subscriptions);

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && NotebookPanel.currentPanel && editor.document.languageId === 'lean4') {
            NotebookPanel.currentPanel.updateDocument(editor.document);
        }
    }, null, context.subscriptions);
}

export function deactivate() { }
