import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load the template HTML, inline renderer.js, and embed the Lean source.
 * renderer.js is the single source of truth for all rendering logic.
 * Inlining it ensures the exported HTML is self-contained and uses
 * exactly the same logic as the VSCode WebView.
 */
/**
 * Extract the MATHJAX_CONFIG object literal from renderer.js as a JSON string.
 * This is the single source of truth for MathJax configuration.
 * Both the HTML export and the VSCode WebView use this value.
 */
function extractMathJaxConfig(rendererJs: string): string {
    // Match: const MATHJAX_CONFIG = { ... }; (potentially multi-line)
    const match = rendererJs.match(/const MATHJAX_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (!match) {
        throw new Error('MATHJAX_CONFIG not found in renderer.js — cannot build HTML export.');
    }
    // Evaluate the object literal to produce valid JSON.
    // We use Function() to safely evaluate the JS object literal.
    // eslint-disable-next-line no-new-func
    const cfg = new Function(`return ${match[1]}`)();
    return JSON.stringify(cfg);
}

function extractStringConst(rendererJs: string, name: string): string {
    const match = rendererJs.match(new RegExp(`const ${name}\\s*=\\s*'([^']+)'`));
    if (!match) { throw new Error(`${name} not found in renderer.js`); }
    return match[1];
}

function buildHtml(extensionUri: vscode.Uri, leanSource: string): string {
    const templatePath = vscode.Uri.joinPath(extensionUri, 'media', 'template.html');
    const rendererPath = vscode.Uri.joinPath(extensionUri, 'media', 'renderer.js');
    const stylePath = vscode.Uri.joinPath(extensionUri, 'media', 'style.css');
    const markedPath = vscode.Uri.joinPath(extensionUri, 'media', 'marked.min.js');
    const mermaidPath = vscode.Uri.joinPath(extensionUri, 'media', 'mermaid.min.js');
    const vizPath = vscode.Uri.joinPath(extensionUri, 'media', 'viz-global.js');

    let template = fs.readFileSync(templatePath.fsPath, 'utf8');
    const rendererJs = fs.readFileSync(rendererPath.fsPath, 'utf8');
    const styleCss = fs.readFileSync(stylePath.fsPath, 'utf8');
    const markedJs = fs.readFileSync(markedPath.fsPath, 'utf8');
    const mermaidJs = fs.readFileSync(mermaidPath.fsPath, 'utf8');
    const vizJs = fs.readFileSync(vizPath.fsPath, 'utf8');

    // Inject style.css — single source of truth for all styles.
    template = template.replace('%%STYLES%%', () => styleCss);

    // Inject MATHJAX_CDN_URL from renderer.js — single source of truth.
    const mathJaxCdnUrl = extractStringConst(rendererJs, 'MATHJAX_CDN_URL');
    template = template.replace('%%MATHJAX_CDN_URL%%', () => mathJaxCdnUrl);

    // Inject MATHJAX_CONFIG from renderer.js — single source of truth.
    const mathJaxConfigJson = extractMathJaxConfig(rendererJs);
    template = template.replace('%%MATHJAX_CONFIG%%', () => mathJaxConfigJson);

    // Inline marked.js, mermaid.js, and viz.js — same local files as Extension uses.
    const safeMarkedJs = markedJs.replace(/<\/script>/gi, '<\\/script>');
    const safeMermaidJs = mermaidJs.replace(/<\/script>/gi, '<\\/script>');
    const safeVizJs = vizJs.replace(/<\/script>/gi, '<\\/script>');
    template = template.replace('%%MARKED_JS%%', () => safeMarkedJs);
    template = template.replace('%%MERMAID_JS%%', () => safeMermaidJs);
    template = template.replace('%%VIZ_JS%%', () => safeVizJs);

    // Inline renderer.js — escape </script> to prevent early tag closure.
    const safeRendererJs = rendererJs.replace(/<\/script>/gi, '<\\/script>');
    template = template.replace('%%RENDERER_JS%%', () => safeRendererJs);

    // Embed the Lean source — escape </script> to prevent early tag closure.
    const safeLeanSource = leanSource.replace(/<\/script>/gi, '<\\/script>');
    template = template.replace('%%LEAN_SOURCE%%', () => safeLeanSource);
    return template;
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
