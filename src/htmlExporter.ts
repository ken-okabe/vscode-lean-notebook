import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load the template HTML and embed the Lean source.
 */
function buildHtml(extensionUri: vscode.Uri, leanSource: string): string {
    const templatePath = vscode.Uri.joinPath(extensionUri, 'media', 'template.html');
    const template = fs.readFileSync(templatePath.fsPath, 'utf8');
    return template.replace('%%LEAN_SOURCE%%', leanSource);
}

/**
 * Return a unique output path to avoid overwriting existing files.
 * something_lean.html -> something_lean_1.html -> something_lean_2.html ...
 */
function uniqueOutputPath(dir: string, baseName: string): string {
    const candidate = path.join(dir, baseName);
    if (!fs.existsSync(candidate)) return candidate;

    const ext = path.extname(baseName);          // .html
    const stem = baseName.slice(0, -ext.length); // something_lean
    let n = 1;
    while (true) {
        const renamed = path.join(dir, `${stem}_${n}${ext}`);
        if (!fs.existsSync(renamed)) return renamed;
        n++;
    }
}

/**
 * Convert a .lean filename to the output HTML filename.
 * something.lean -> something_lean.html
 */
function toHtmlFileName(leanFileName: string): string {
    const base = path.basename(leanFileName, '.lean');
    return `${base}_lean.html`;
}

/**
 * Recursively find all *.lean files under a directory.
 */
function findLeanFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findLeanFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.lean')) {
            results.push(fullPath);
        }
    }
    return results;
}

/**
 * Export a single .lean file to the output directory,
 * preserving the relative path from sourceRoot.
 * If sourceRoot is undefined, the file is placed directly in outputDir.
 */
async function exportSingleFile(
    extensionUri: vscode.Uri,
    leanFilePath: string,
    outputDir: string,
    sourceRoot?: string
): Promise<string> {
    const leanSource = fs.readFileSync(leanFilePath, 'utf8');
    const html = buildHtml(extensionUri, leanSource);

    let targetDir = outputDir;
    if (sourceRoot) {
        // Preserve directory structure relative to sourceRoot
        const relDir = path.relative(sourceRoot, path.dirname(leanFilePath));
        targetDir = path.join(outputDir, relDir);
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const htmlFileName = toHtmlFileName(leanFilePath);
    const outputPath = uniqueOutputPath(targetDir, htmlFileName);
    fs.writeFileSync(outputPath, html, 'utf8');
    return outputPath;
}

/**
 * Entry point for the HTML Export command.
 * Shows a QuickPick to choose between single file and batch directory export.
 */
export async function runHtmlExport(
    extensionUri: vscode.Uri,
    currentDocument: vscode.TextDocument | undefined
): Promise<void> {

    // --- Step 1: Choose export mode ---
    const choice = await vscode.window.showQuickPick(
        [
            {
                label: '$(file) Export current file',
                description: 'Export the currently active .lean file as HTML',
                value: 'single'
            },
            {
                label: '$(folder) Export all .lean files in a directory…',
                description: 'Select a directory and export all *.lean files recursively',
                value: 'batch'
            }
        ],
        { placeHolder: 'LeanNotebook: HTML Export — Select export mode' }
    );
    if (!choice) return;

    // ================================================================
    // Single file export
    // ================================================================
    if ((choice as any).value === 'single') {
        if (!currentDocument) {
            vscode.window.showErrorMessage(
                'HTML Export: No active Lean file. Please open a .lean file first.'
            );
            return;
        }
        const leanFilePath = currentDocument.uri.fsPath;
        if (!leanFilePath.endsWith('.lean')) {
            vscode.window.showErrorMessage(
                'HTML Export: The active file is not a .lean file.'
            );
            return;
        }

        // Select output directory
        const outputDirResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Output Folder'
        });
        if (!outputDirResult || outputDirResult.length === 0) return;
        const outputDir = outputDirResult[0].fsPath;

        const htmlFileName = toHtmlFileName(leanFilePath);
        const outputPath = path.join(outputDir, htmlFileName);
        const willRename = fs.existsSync(outputPath);

        // --- Confirmation ---
        const confirmMsg = [
            `Source:  ${leanFilePath}`,
            `Output:  ${outputDir}`,
            `File:    ${htmlFileName}${willRename ? '  (will be renamed to avoid overwrite)' : ''}`
        ].join('\n');

        const confirmed = await vscode.window.showInformationMessage(
            `Export this file as HTML?\n\n${confirmMsg}`,
            { modal: true },
            'Export'
        );
        if (confirmed !== 'Export') return;

        try {
            const finalPath = await exportSingleFile(extensionUri, leanFilePath, outputDir);
            vscode.window.showInformationMessage(
                `HTML Export complete: ${path.basename(finalPath)}`,
                'Open in Browser'
            ).then(sel => {
                if (sel === 'Open in Browser') {
                    vscode.env.openExternal(vscode.Uri.file(finalPath));
                }
            });
        } catch (e) {
            vscode.window.showErrorMessage(`HTML Export failed: ${e}`);
        }
        return;
    }

    // ================================================================
    // Batch directory export
    // ================================================================
    if ((choice as any).value === 'batch') {

        // Step 2a: Select source directory
        const sourceDirResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Source Directory (containing .lean files)'
        });
        if (!sourceDirResult || sourceDirResult.length === 0) return;
        const sourceDir = sourceDirResult[0].fsPath;

        // Enumerate .lean files
        const leanFiles = findLeanFiles(sourceDir);
        if (leanFiles.length === 0) {
            vscode.window.showWarningMessage(
                `HTML Export: No .lean files found in:\n${sourceDir}`
            );
            return;
        }

        // Step 2b: Select output directory
        const outputDirResult = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Output Directory'
        });
        if (!outputDirResult || outputDirResult.length === 0) return;
        const outputDir = outputDirResult[0].fsPath;

        // --- Confirmation ---
        // Show a preview of the directory structure to be created
        const sourceDirName = path.basename(sourceDir);
        const previewLines: string[] = [];
        const maxPreview = 10;
        for (let i = 0; i < Math.min(leanFiles.length, maxPreview); i++) {
            const rel = path.relative(sourceDir, leanFiles[i]);
            const relDir = path.dirname(rel);
            const htmlName = toHtmlFileName(leanFiles[i]);
            const outRel = relDir === '.'
                ? path.join(sourceDirName, htmlName)
                : path.join(sourceDirName, relDir, htmlName);
            previewLines.push(`  ${outRel}`);
        }
        if (leanFiles.length > maxPreview) {
            previewLines.push(`  … and ${leanFiles.length - maxPreview} more`);
        }

        const confirmMsg = [
            `Source directory:  ${sourceDir}`,
            `Output directory:  ${outputDir}`,
            `Files to export:   ${leanFiles.length} .lean file(s)`,
            ``,
            `Directory structure will be preserved:`,
            ...previewLines
        ].join('\n');

        const confirmed = await vscode.window.showInformationMessage(
            `Export ${leanFiles.length} .lean file(s) as HTML?\n\n${confirmMsg}`,
            { modal: true },
            'Export All'
        );
        if (confirmed !== 'Export All') return;

        // --- Execute batch export with progress ---
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'LeanNotebook: HTML Export',
                cancellable: false
            },
            async (progress) => {
                let exported = 0;
                let failed = 0;
                for (const leanFilePath of leanFiles) {
                    const rel = path.relative(sourceDir, leanFilePath);
                    progress.report({
                        message: `(${exported + 1}/${leanFiles.length}) ${rel}`,
                        increment: 100 / leanFiles.length
                    });
                    try {
                        // Use parent of sourceDir as root so that sourceDir itself
                        // becomes the top-level folder inside outputDir.
                        await exportSingleFile(extensionUri, leanFilePath, outputDir, path.dirname(sourceDir));
                        exported++;
                    } catch (e) {
                        console.error(`HTML Export skip: ${leanFilePath}`, e);
                        failed++;
                    }
                }

                const msg = failed === 0
                    ? `HTML Export complete: ${exported} file(s) exported to ${outputDir}`
                    : `HTML Export done: ${exported} exported, ${failed} failed. Output: ${outputDir}`;
                vscode.window.showInformationMessage(msg);
            }
        );
    }
}
