import * as vscode from 'vscode';
import { NotebookPanel } from './panels/NotebookPanel';

export function activate(context: vscode.ExtensionContext) {
    // Track the last active document URI to handle navigation correctly
    let lastActiveUri: string | undefined = undefined;

    // Create Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    // Register Commands
    const toggleCommand = vscode.commands.registerCommand('leannotebook.openPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && (editor.document.languageId === 'lean4' || editor.document.fileName.endsWith('.lean'))) {
            NotebookPanel.createOrShow(context.extensionUri, editor.document);
        } else {
            vscode.window.showErrorMessage("Active editor is not a Lean 4 file. (LangId: " + editor?.document.languageId + ")");
        }
    });

    const showSourceCommand = vscode.commands.registerCommand('leannotebook.showSource', async () => {
        if (lastActiveUri) {
            try {
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(lastActiveUri));
                await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            } catch (e) {
                console.error('Failed to open source', e);
            }
        }
    });

    context.subscriptions.push(toggleCommand, showSourceCommand);

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

    // Function to handle editor changes and status bar updates
    const handleEditorChange = (editor: vscode.TextEditor | undefined) => {
        if (editor && (editor.document.languageId === 'lean4' || editor.document.fileName.endsWith('.lean'))) {
            const currentUri = editor.document.uri.toString();

            // If the active document is different from the last one we handled,
            // (New Visit) -> Open Preview
            if (currentUri !== lastActiveUri) {
                lastActiveUri = currentUri;
                NotebookPanel.createOrShow(context.extensionUri, editor.document);
                // The status bar update will happen when the preview takes focus (editor becomes undefined)
            } else {
                // (Same Visit) -> We are seeing the Source Editor again.
                // Show "Open Preview"
                statusBarItem.text = '$(preview) Open Preview';
                statusBarItem.tooltip = 'Switch to Lean Notebook Preview';
                statusBarItem.command = 'leannotebook.openPreview';
                statusBarItem.show();
            }
        } else if (!editor && lastActiveUri) {
            // Editor is undefined -> Likely Focus is on Preview or Output interactively
            // If we have a tracked lean file, assume we are viewing it in Preview
            statusBarItem.text = '$(code) Open Source';
            statusBarItem.tooltip = 'Switch to Lean Source';
            statusBarItem.command = 'leannotebook.showSource';
            statusBarItem.show();
        } else {
            // Active editor is NOT lean (e.g. .ts file)
            statusBarItem.hide();

            // Update lastActiveUri for non-lean files too, 
            // so switching back to lean triggers the "New Visit" logic.
            if (editor) {
                lastActiveUri = editor.document.uri.toString();
            }
        }
    };

    // Check on activation (for the currently active file)
    handleEditorChange(vscode.window.activeTextEditor);

    // Check whenever the active editor changes
    const changeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
        handleEditorChange(editor);
    });

    context.subscriptions.push(changeDisposable);
}

export function deactivate() { }
