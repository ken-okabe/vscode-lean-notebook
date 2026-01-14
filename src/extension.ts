import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension activated');
    vscode.window.showInformationMessage('LeanNotebook is Activated');
}

export function deactivate() {
    console.log('Extension deactivated');
}
