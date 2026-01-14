import * as vscode from 'vscode';
import { NotebookPanel } from './panels/NotebookPanel';
import { leanLspManager } from './leanLspClient';

export function activate(context: vscode.ExtensionContext) {
    // Track the last active document URI to handle navigation correctly
    let lastActiveUri: string | undefined = undefined;
    // Store scroll positions for each document (line number for source)
    const sourceScrollPositions = new Map<string, number>();
    // Store preview scroll position (percentage)
    let previewScrollPercentage: number = 0;

    // Interval for tracking source editor scroll position
    let sourceScrollTracker: NodeJS.Timeout | undefined = undefined;

    // Create Status Bar Item
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    context.subscriptions.push(statusBarItem);

    // Function to start tracking source editor scroll position
    const startSourceScrollTracking = () => {
        if (sourceScrollTracker) {
            return; // Already tracking
        }
        
        console.log('[SourceScroll] Starting source scroll tracking');
        sourceScrollTracker = setInterval(() => {
            const editor = vscode.window.activeTextEditor;
            if (editor && lastActiveUri && editor.document.uri.toString() === lastActiveUri) {
                const topLine = editor.visibleRanges[0]?.start.line || 0;
                sourceScrollPositions.set(lastActiveUri, topLine);
                // Don't log every second to avoid spam
                // console.log(`[SourceScroll] Tracking: line ${topLine}`);
            }
        }, 1000); // Every 1 second
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
        if (editor) {
            const isLean = editor.document.languageId === 'lean4' || editor.document.fileName.endsWith('.lean');
            const isMarkdown = editor.document.languageId === 'markdown' || editor.document.fileName.endsWith('.md');
            
            if (isLean || isMarkdown) {
                const uri = editor.document.uri.toString();
                // Use the tracked scroll position
                const topLine = sourceScrollPositions.get(uri) || editor.visibleRanges[0]?.start.line || 0;
                console.log(`[openPreview] Using scroll position: line ${topLine}`);
                
                // Stop tracking source, preview will track itself
                stopSourceScrollTracking();
                
                NotebookPanel.createOrShow(context.extensionUri, editor.document, topLine);
            } else {
                vscode.window.showErrorMessage("Active editor is not a Lean 4 or Markdown file. (LangId: " + editor.document.languageId + ")");
            }
        }
    });

    const showSourceCommand = vscode.commands.registerCommand('leannotebook.showSource', async () => {
        if (lastActiveUri) {
            try {
                // Get the most recent scroll position from preview (updated every second)
                let scrollPercentage = 0;
                if (NotebookPanel.currentPanel) {
                    scrollPercentage = NotebookPanel.currentPanel.getLastScrollPosition();
                    previewScrollPercentage = scrollPercentage;
                    console.log(`[ShowSource] Using preview scroll position: ${(scrollPercentage * 100).toFixed(1)}%`);
                }

                const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(lastActiveUri));
                const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
                
                // Calculate target line based on scroll percentage
                const totalLines = doc.lineCount;
                const targetLine = Math.floor(scrollPercentage * totalLines);
                
                // Move cursor to that line and reveal it
                const position = new vscode.Position(targetLine, 0);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
                
                console.log(`[ShowSource] Scrolled to line ${targetLine} (${(scrollPercentage * 100).toFixed(1)}%)`);
                
                // Start tracking source scroll position
                startSourceScrollTracking();
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
        const isLean = editor && (editor.document.languageId === 'lean4' || editor.document.fileName.endsWith('.lean'));
        const isMarkdown = editor && (editor.document.languageId === 'markdown' || editor.document.fileName.endsWith('.md'));
        
        if (isLean || isMarkdown) {
            const currentUri = editor.document.uri.toString();

            // If the active document is different from the last one we handled,
            // (New Visit) -> Open Preview
            if (currentUri !== lastActiveUri) {
                lastActiveUri = currentUri;
                const topLine = editor.visibleRanges[0]?.start.line || 0;
                sourceScrollPositions.set(currentUri, topLine);
                console.log(`[handleEditorChange] Initial scroll position: line ${topLine}`);
                
                // Start tracking source scroll
                startSourceScrollTracking();
                
                NotebookPanel.createOrShow(context.extensionUri, editor.document, topLine);
                // The status bar update will happen when the preview takes focus (editor becomes undefined)
            } else {
                // (Same Visit) -> We are seeing the Source Editor again.
                // Show "Open Preview"
                statusBarItem.text = '$(preview) Open Preview';
                statusBarItem.tooltip = 'Switch to Preview';
                statusBarItem.command = 'leannotebook.openPreview';
                statusBarItem.show();
                
                // Make sure source tracking is active
                startSourceScrollTracking();
            }
        } else if (!editor && lastActiveUri) {
            // Editor is undefined -> Likely Focus is on Preview or Output interactively
            // If we have a tracked file, assume we are viewing it in Preview
            statusBarItem.text = '$(code) Open Source';
            statusBarItem.tooltip = 'Switch to Source';
            statusBarItem.command = 'leannotebook.showSource';
            statusBarItem.show();
            
            // Stop tracking source when viewing preview
            stopSourceScrollTracking();
        } else {
            // Active editor is NOT lean or markdown (e.g. .ts file)
            statusBarItem.hide();
            stopSourceScrollTracking();

            // Update lastActiveUri for non-lean/markdown files too, 
            // so switching back triggers the "New Visit" logic.
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

export function deactivate() {
    leanLspManager.disposeAll();
}
