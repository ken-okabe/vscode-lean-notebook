import * as vscode from 'vscode';
import { NotebookPanel } from './panels/NotebookPanel';
import { leanLspManager } from './leanLspClient';
import { runHtmlExport } from './htmlExporter';

export function activate(context: vscode.ExtensionContext) {
    // Store scroll positions for each document (line number for source)
    const sourceScrollPositions = new Map<string, number>();
    
    // Interval for tracking source editor scroll position
    let sourceScrollTracker: NodeJS.Timeout | undefined = undefined;
    
    // Track the URI of the document currently being shown in preview
    let currentPreviewDocUri: string | undefined = undefined;

    // Create Status Bar Items
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    // HTML Export status bar button
    const exportStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    exportStatusBarItem.text = '$(export) HTML Export';
    exportStatusBarItem.tooltip = 'LeanNotebook: Export as HTML file(s)';
    exportStatusBarItem.command = 'leannotebook.htmlExport';
    context.subscriptions.push(exportStatusBarItem);

    // Function to check if a document is Lean or Markdown
    const isLeanOrMarkdown = (doc: vscode.TextDocument | undefined): boolean => {
        if (!doc) return false;
        return doc.languageId === 'lean4' || 
               doc.fileName.endsWith('.lean') ||
               doc.languageId === 'markdown' || 
               doc.fileName.endsWith('.md');
    };

    // Function to update status bar based on current state
    const updateStatusBar = () => {
        const editor = vscode.window.activeTextEditor;
        
        if (editor && isLeanOrMarkdown(editor.document)) {
            // We're in source editor - show "Open Preview" button
            statusBarItem.text = '$(preview) Open Preview';
            statusBarItem.tooltip = 'Switch to Preview';
            statusBarItem.command = 'leannotebook.openPreview';
            statusBarItem.show();
            exportStatusBarItem.show();
        } else if (!editor && NotebookPanel.currentPanel) {
            // No active editor but we have a preview - show "Open Source" button
            statusBarItem.text = '$(code) Open Source';
            statusBarItem.tooltip = 'Switch to Source';
            statusBarItem.command = 'leannotebook.showSource';
            statusBarItem.show();
            exportStatusBarItem.show();
        } else {
            // Not a Lean/Markdown file
            statusBarItem.hide();
            exportStatusBarItem.hide();
        }
    };

    // Function to start tracking source editor scroll position
    const startSourceScrollTracking = () => {
        if (sourceScrollTracker) {
            return; // Already tracking
        }
        
        console.log('[SourceScroll] Starting source scroll tracking');
        sourceScrollTracker = setInterval(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor && currentPreviewDocUri && editor.document.uri.toString() === currentPreviewDocUri) {
                const topLine = editor.visibleRanges[0]?.start.line || 0;
                sourceScrollPositions.set(currentPreviewDocUri, topLine);
            }
        }, 1000);
    };

    // Function to stop tracking source editor scroll position
    const stopSourceScrollTracking = () => {
        if (sourceScrollTracker) {
            console.log('[SourceScroll] Stopping source scroll tracking');
            clearInterval(sourceScrollTracker);
            sourceScrollTracker = undefined;
        }
    };

    // Register Commands
    const toggleCommand = vscode.commands.registerCommand('leannotebook.openPreview', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && isLeanOrMarkdown(editor.document)) {
            const uri = editor.document.uri.toString();
            const topLine = sourceScrollPositions.get(uri) || editor.visibleRanges[0]?.start.line || 0;
            console.log(`[openPreview] Opening preview for ${uri} at line ${topLine}`);
            
            currentPreviewDocUri = uri;
            stopSourceScrollTracking();
            
            NotebookPanel.createOrShow(context.extensionUri, editor.document, topLine);
            updateStatusBar();
        } else {
            vscode.window.showErrorMessage("Active editor is not a Lean 4 or Markdown file.");
        }
    });

    const showSourceCommand = vscode.commands.registerCommand('leannotebook.showSource', async () => {
        if (NotebookPanel.currentPanel && NotebookPanel.currentPanel._document) {
            try {
                const scrollPercentage = NotebookPanel.currentPanel.getLastScrollPosition();
                console.log(`[ShowSource] Using preview scroll position: ${(scrollPercentage * 100).toFixed(1)}%`);

                const doc = NotebookPanel.currentPanel._document;
                const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                
                const totalLines = doc.lineCount;
                const targetLine = Math.floor(scrollPercentage * totalLines);
                
                const position = new vscode.Position(targetLine, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
                
                console.log(`[ShowSource] Scrolled to line ${targetLine}`);
                
                startSourceScrollTracking();
                updateStatusBar();
            } catch (e) {
                console.error('Failed to open source', e);
            }
        }
    });

    // HTML Export command
    const htmlExportCommand = vscode.commands.registerCommand('leannotebook.htmlExport', () => {
        const doc = NotebookPanel.currentPanel?._document 
            ?? vscode.window.activeTextEditor?.document;
        runHtmlExport(context.extensionUri, doc);
    });

    context.subscriptions.push(toggleCommand, showSourceCommand, htmlExportCommand);

    // Listen for diagnostic changes (e.g. #eval results arriving)
    vscode.languages.onDidChangeDiagnostics(e => {
        try {
            if (NotebookPanel.currentPanel && NotebookPanel.currentPanel._document) {
                if (e.uris.some(uri => uri.toString() === NotebookPanel.currentPanel!._document!.uri.toString())) {
                    console.log("LeanNotebook: Diagnostics changed for current doc.");
                    NotebookPanel.currentPanel.updateDocument(NotebookPanel.currentPanel._document);
                }
            }
        } catch (error) {
            console.error("Error in onDidChangeDiagnostics:", error);
        }
    }, null, context.subscriptions);

    // Auto-open preview for Lean and Markdown files
    const handleEditorChange = (editor: vscode.TextEditor | undefined) => {
        console.log(`[handleEditorChange] Editor: ${editor?.document.fileName || 'undefined'}, languageId: ${editor?.document.languageId || 'N/A'}`);
        
        if (editor && isLeanOrMarkdown(editor.document)) {
            const uri = editor.document.uri.toString();
            console.log(`[handleEditorChange] Lean/Markdown file: ${uri}`);
            
            // Check if we need to open/update preview
            const needsPreview = !NotebookPanel.currentPanel || 
                                NotebookPanel.currentPanel._document?.uri.toString() !== uri;
            
            console.log(`[handleEditorChange] Current panel exists: ${!!NotebookPanel.currentPanel}, Needs preview: ${needsPreview}`);
            
            if (needsPreview) {
                console.log(`[handleEditorChange] Opening preview for: ${uri}`);
                currentPreviewDocUri = uri;
                
                const topLine = editor.visibleRanges[0]?.start.line || 0;
                sourceScrollPositions.set(uri, topLine);
                
                startSourceScrollTracking();
                NotebookPanel.createOrShow(context.extensionUri, editor.document, topLine);
            } else {
                console.log(`[handleEditorChange] Same document, starting scroll tracking`);
                startSourceScrollTracking();
            }
        } else {
            console.log(`[handleEditorChange] Not a Lean/Markdown file, stopping tracking`);
            stopSourceScrollTracking();
        }
        
        updateStatusBar();
    };

    // Initial check
    console.log('[Extension] Activating LeanNotebook extension');
    handleEditorChange(vscode.window.activeTextEditor);

    // Listen for editor changes
    const changeDisposable = vscode.window.onDidChangeActiveTextEditor(handleEditorChange);
    context.subscriptions.push(changeDisposable);
}

export function deactivate() {
    leanLspManager.disposeAll();
}
