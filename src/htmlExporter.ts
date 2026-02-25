import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load the template HTML, inject style.css + renderer.js + MathJax config,
 * and embed the Lean source. Library JS files are referenced via relative
 * paths to a _libs/ directory that is copied alongside the HTML at export time.
 */

function extractMathJaxConfig(rendererJs: string): string {
    const match = rendererJs.match(/const MATHJAX_CONFIG\s*=\s*(\{[\s\S]*?\});/);
    if (!match) {
        throw new Error('MATHJAX_CONFIG not found in renderer.js — cannot build HTML export.');
    }
    // eslint-disable-next-line no-new-func
    const cfg = new Function(`return ${match[1]}`)();
    return JSON.stringify(cfg);
}

/**
 * Copy the _libs/ directory from the extension's media/ to the target location.
 * Skips if already exists at the target.
 */
function copyLibs(extensionUri: vscode.Uri, targetDir: string): void {
    const srcLibs = path.join(vscode.Uri.joinPath(extensionUri, 'media', '_libs').fsPath);
    const dstLibs = path.join(targetDir, '_libs');
    if (fs.existsSync(dstLibs)) return; // already present
    copyDirRecursive(srcLibs, dstLibs);
}

function copyDirRecursive(src: string, dst: string): void {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, dstPath);
        } else {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}

function buildHtml(extensionUri: vscode.Uri, leanSource: string, libsRelPath: string = './_libs'): string {
    const templatePath = vscode.Uri.joinPath(extensionUri, 'media', 'template.html');
    const rendererPath = vscode.Uri.joinPath(extensionUri, 'media', 'renderer.js');
    const stylePath = vscode.Uri.joinPath(extensionUri, 'media', 'style.css');

    let template = fs.readFileSync(templatePath.fsPath, 'utf8');
    const rendererJs = fs.readFileSync(rendererPath.fsPath, 'utf8');
    const styleCss = fs.readFileSync(stylePath.fsPath, 'utf8');

    // Replace _libs/ paths with the correct relative path for this file's depth.
    template = template.replace(/\.\/\_libs/g, libsRelPath);

    // Inject style.css — single source of truth for all styles.
    template = template.replace('%%STYLES%%', () => styleCss);

    // Inject MATHJAX_CONFIG from renderer.js — single source of truth.
    const mathJaxConfigJson = extractMathJaxConfig(rendererJs);
    template = template.replace('%%MATHJAX_CONFIG%%', () => mathJaxConfigJson);

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
 * Export a single .lean file.
 * - If sourceRoot is undefined (single-file mode): creates FileName/ directory
 *   containing index.html + _libs/.
 * - If sourceRoot is provided (batch mode): places HTML in the appropriate
 *   relative path under outputDir. libsRoot is the dir that contains _libs/.
 */
async function exportSingleFile(
    extensionUri: vscode.Uri,
    leanFilePath: string,
    outputDir: string,
    sourceRoot?: string,
    libsRoot?: string
): Promise<string> {
    const leanSource = fs.readFileSync(leanFilePath, 'utf8');

    let targetDir: string;
    let libsRelPath = './_libs';

    if (sourceRoot) {
        // Batch mode: preserve directory structure relative to sourceRoot
        const relDir = path.relative(sourceRoot, path.dirname(leanFilePath));
        targetDir = path.join(outputDir, relDir);

        // Compute relative path from targetDir to _libs/ (which is in libsRoot)
        if (libsRoot) {
            const relToLibs = path.relative(targetDir, path.join(libsRoot, '_libs'));
            libsRelPath = relToLibs.split(path.sep).join('/');
        }
    } else {
        // Single-file mode: create FileName/ directory
        const dirName = path.basename(leanFilePath, '.lean');
        targetDir = path.join(outputDir, dirName);
        // Copy _libs/ into this directory
        fs.mkdirSync(targetDir, { recursive: true });
        copyLibs(extensionUri, targetDir);
    }

    const html = buildHtml(extensionUri, leanSource, libsRelPath);
    fs.mkdirSync(targetDir, { recursive: true });

    const htmlFileName = sourceRoot ? toHtmlFileName(leanFilePath) : 'index.html';
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

        const dirName = path.basename(leanFilePath, '.lean');
        const exportDir = path.join(outputDir, dirName);

        // --- Confirmation ---
        const confirmMsg = [
            `Source:  ${leanFilePath}`,
            `Output:  ${exportDir}/`,
            `         index.html + _libs/`
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
                `HTML Export complete: ${dirName}/index.html`,
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

        // Export parent directory: outputDir/SourceDirName/
        const sourceDirName = path.basename(sourceDir);
        const exportRoot = path.join(outputDir, sourceDirName);
        const htmlDir = path.join(exportRoot, sourceDirName + '_Separate_HTML');
        const viewerDir = path.join(exportRoot, sourceDirName + '_Lean_Viewer');

        // --- Confirmation ---
        const previewLines: string[] = [];
        const maxPreview = 8;
        for (let i = 0; i < Math.min(leanFiles.length, maxPreview); i++) {
            const rel = path.relative(sourceDir, leanFiles[i]);
            const relDir = path.dirname(rel);
            const htmlName = toHtmlFileName(leanFiles[i]);
            const outRel = relDir === '.'
                ? path.join('Contents', htmlName)
                : path.join('Contents', relDir, htmlName);
            previewLines.push(`    ${outRel}`);
        }
        if (leanFiles.length > maxPreview) {
            previewLines.push(`    … and ${leanFiles.length - maxPreview} more`);
        }

        const confirmMsg = [
            `Source:  ${sourceDir}`,
            `Output:  ${exportRoot}/`,
            `Files:   ${leanFiles.length} .lean file(s)`,
            ``,
            `Output structure:`,
            `  ${sourceDirName}_Separate_HTML/`,
            `    _libs/`,
            ...previewLines,
            `  ${sourceDirName}_Lean_Viewer/`,
            `    Viewer.html`,
            `    _libs/`,
            `    Contents/ (.lean files)`
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
                // --- Separate HTML export ---
                fs.mkdirSync(htmlDir, { recursive: true });
                copyLibs(extensionUri, htmlDir);

                const contentsDir = path.join(htmlDir, 'Contents');
                let exported = 0;
                let failed = 0;
                for (const leanFilePath of leanFiles) {
                    const rel = path.relative(sourceDir, leanFilePath);
                    progress.report({
                        message: `(${exported + 1}/${leanFiles.length}) ${rel}`,
                        increment: 80 / leanFiles.length
                    });
                    try {
                        await exportSingleFile(extensionUri, leanFilePath, contentsDir, sourceDir, htmlDir);
                        exported++;
                    } catch (e) {
                        console.error(`HTML Export skip: ${leanFilePath}`, e);
                        failed++;
                    }
                }

                // --- Lean Viewer export ---
                progress.report({ message: 'Generating Lean Viewer…', increment: 10 });
                try {
                    fs.mkdirSync(viewerDir, { recursive: true });
                    copyLibs(extensionUri, viewerDir);
                    copyLeanFiles(sourceDir, path.join(viewerDir, 'Contents'));
                    const viewerHtml = buildViewerHtml(extensionUri);
                    fs.writeFileSync(path.join(viewerDir, 'Viewer.html'), viewerHtml, 'utf8');
                } catch (e) {
                    console.error('Lean Viewer export failed:', e);
                }

                const msg = failed === 0
                    ? `Export complete: ${exported} file(s) → ${exportRoot}/`
                    : `Export done: ${exported} exported, ${failed} failed → ${exportRoot}/`;
                vscode.window.showInformationMessage(msg);
            }
        );
    }
}

/**
 * Build the Book Viewer HTML from viewer-template.html.
 * Injects renderer.js, style.css, and MathJax config.
 */
function buildViewerHtml(extensionUri: vscode.Uri): string {
    const viewerTemplatePath = vscode.Uri.joinPath(extensionUri, 'media', 'viewer-template.html');
    const rendererPath = vscode.Uri.joinPath(extensionUri, 'media', 'renderer.js');
    const stylePath = vscode.Uri.joinPath(extensionUri, 'media', 'style.css');

    let template = fs.readFileSync(viewerTemplatePath.fsPath, 'utf8');
    const rendererJs = fs.readFileSync(rendererPath.fsPath, 'utf8');
    const styleCss = fs.readFileSync(stylePath.fsPath, 'utf8');

    // Inject style.css
    template = template.replace('%%STYLES%%', () => styleCss);

    // Inject MATHJAX_CONFIG
    const mathJaxConfigJson = extractMathJaxConfig(rendererJs);
    template = template.replace('%%MATHJAX_CONFIG%%', () => mathJaxConfigJson);

    // Inline renderer.js
    const safeRendererJs = rendererJs.replace(/<\/script>/gi, '<\\/script>');
    template = template.replace('%%RENDERER_JS%%', () => safeRendererJs);

    return template;
}

/**
 * Copy all .lean files from sourceDir to destDir, preserving directory structure.
 */
function copyLeanFiles(sourceDir: string, destDir: string): void {
    const leanFiles = findLeanFiles(sourceDir);
    for (const leanFile of leanFiles) {
        const rel = path.relative(sourceDir, leanFile);
        const dest = path.join(destDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(leanFile, dest);
    }
}
