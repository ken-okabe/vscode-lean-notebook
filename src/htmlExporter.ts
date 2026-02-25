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
            `    _libs/ + Contents/`,
            `  ${sourceDirName}_Lean_Viewer/`,
            `    Viewer.html + _libs/ + Contents/`,
            `  ${sourceDirName}_All_in_ONE.html`
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
                progress.report({ message: 'Generating Lean Viewer…', increment: 5 });
                try {
                    fs.mkdirSync(viewerDir, { recursive: true });
                    copyLibs(extensionUri, viewerDir);
                    copyLeanFiles(sourceDir, path.join(viewerDir, 'Contents'));
                    const viewerHtml = buildViewerHtml(extensionUri, sourceDirName);
                    fs.writeFileSync(path.join(viewerDir, 'Viewer.html'), viewerHtml, 'utf8');
                } catch (e) {
                    console.error('Lean Viewer export failed:', e);
                }

                // --- All-in-ONE export ---
                progress.report({ message: 'Generating All-in-ONE…', increment: 5 });
                try {
                    const allInOneHtml = buildAllInOneHtml(extensionUri, sourceDir, sourceDirName);
                    const allInOnePath = path.join(exportRoot, sourceDirName + '_All_in_ONE.html');
                    fs.writeFileSync(allInOnePath, allInOneHtml, 'utf8');
                } catch (e) {
                    console.error('All-in-ONE export failed:', e);
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
function buildViewerHtml(extensionUri: vscode.Uri, bookTitle: string = 'Lean Notebook'): string {
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

    // Inject book title as a JS variable before the closing </body>
    const titleScript = '<script>var BOOK_TITLE = ' + JSON.stringify(bookTitle) + ';<' + '/script>';
    template = template.replace('</body>', titleScript + '\n</body>');

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

/**
 * Build a completely self-contained All-in-ONE HTML file.
 * Uses tex-svg.js (SVG output, no external fonts needed).
 * All libraries inlined. All .lean sources embedded.
 */
function buildAllInOneHtml(extensionUri: vscode.Uri, sourceDir: string, bookTitle: string = 'Lean Notebook'): string {
    const mediaDir = vscode.Uri.joinPath(extensionUri, 'media').fsPath;
    const libsDir = path.join(mediaDir, '_libs');

    // Read libraries
    const readLib = (p: string) => fs.readFileSync(p, 'utf8');
    const markedJs = readLib(path.join(libsDir, 'marked.min.js'));
    const mermaidJs = readLib(path.join(libsDir, 'mermaid.min.js'));
    const vizJs = readLib(path.join(libsDir, 'viz-standalone.js'));
    const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));
    const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));
    const styleCss = readLib(path.join(mediaDir, 'style.css'));

    // MathJax config
    const mathJaxConfigJson = extractMathJaxConfig(rendererJs);

    // Escape </script> in all inlined JS
    const esc = (s: string) => s.replace(/<\/script>/gi, '<\\/script>');

    // Embed all .lean files
    const leanFiles = findLeanFiles(sourceDir);
    leanFiles.sort((a, b) => a.localeCompare(b));
    const leanScriptTags: string[] = [];
    for (const lf of leanFiles) {
        const rel = path.relative(sourceDir, lf);
        const content = esc(fs.readFileSync(lf, 'utf8'));
        leanScriptTags.push(
            '<script type="text/x-lean-source" data-path="' +
            rel.replace(/"/g, '&quot;') + '">' + content + '<' + '/script>'
        );
    }

    // Viewer CSS (same as viewer-template.html)
    const viewerCss = `
#landing{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:24px;background:var(--bg)}
#landing h1{font-family:var(--font-serif);color:var(--blue-dark);font-size:1.8rem}
#landing p{color:var(--text-muted);font-size:.95rem;max-width:420px;text-align:center;line-height:1.5}
#book-sidebar{position:fixed;top:0;left:0;width:260px;height:100vh;background:var(--surface);border-right:1px solid var(--border);display:none;flex-direction:column;z-index:100;overflow:hidden}
#book-sidebar.active{display:flex}
#book-sidebar .book-header{padding:14px 16px 10px;border-bottom:1px solid var(--border-soft)}
#book-sidebar .book-header .logo{font-family:var(--font-sans);font-weight:600;font-size:.85rem;color:var(--text-muted);letter-spacing:.03em}
#book-sidebar .book-header .logo span{font-weight:300;color:var(--blue)}
#book-sidebar .book-title{font-family:var(--font-serif);font-size:1rem;font-weight:600;color:var(--text);margin-top:6px}
#book-tree{flex:1;overflow-y:auto;padding:8px 0;scrollbar-width:thin;scrollbar-color:var(--blue-dim) transparent}
#book-tree .tree-dir{padding:4px 16px;font-family:var(--font-sans);font-size:.75rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:.04em;margin-top:8px}
#book-tree .tree-dir:first-child{margin-top:0}
#book-tree .tree-file{display:block;padding:5px 16px 5px 24px;font-family:var(--font-sans);font-size:.82rem;color:var(--text-muted);cursor:pointer;text-decoration:none;transition:background .1s,color .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#book-tree .tree-file:hover{background:var(--surface-alt);color:var(--text)}
#book-tree .tree-file.active{background:var(--blue-pale);color:var(--blue-dark);font-weight:500}
#page-area{display:none;margin-left:260px}
#page-area.active{display:block}
`;

    // Viewer JS — reads from embedded <script type="text/x-lean-source"> tags
    const viewerJs = `
var leanFiles = [];
var currentIndex = -1;

(function boot() {
  var tags = document.querySelectorAll('script[type="text/x-lean-source"]');
  for (var i = 0; i < tags.length; i++) {
    leanFiles.push({ path: tags[i].getAttribute('data-path'), name: tags[i].getAttribute('data-path').split('/').pop(), content: tags[i].textContent });
  }
  leanFiles.sort(function(a, b) { return a.path.localeCompare(b.path); });
  if (leanFiles.length === 0) return;
  document.getElementById('landing').style.display = 'none';
  document.getElementById('book-sidebar').classList.add('active');
  document.getElementById('page-area').classList.add('active');
  buildBookTree();
  loadFile(0);
})();

function buildBookTree() {
  var tree = document.getElementById('book-tree');
  tree.innerHTML = '';
  var dirs = {};
  for (var i = 0; i < leanFiles.length; i++) {
    var f = leanFiles[i];
    var dir = f.path.indexOf('/') >= 0 ? f.path.substring(0, f.path.lastIndexOf('/')) : '';
    if (!dirs[dir]) dirs[dir] = [];
    dirs[dir].push({ index: i, name: f.name, path: f.path });
  }
  var keys = Object.keys(dirs);
  for (var k = 0; k < keys.length; k++) {
    var dir = keys[k];
    if (dir) {
      var dirEl = document.createElement('div');
      dirEl.className = 'tree-dir';
      dirEl.textContent = dir;
      tree.appendChild(dirEl);
    }
    var items = dirs[dir];
    for (var j = 0; j < items.length; j++) {
      var el = document.createElement('a');
      el.className = 'tree-file';
      el.textContent = items[j].name.replace('.lean', '');
      el.setAttribute('data-index', items[j].index);
      el.addEventListener('click', (function(idx) { return function() { loadFile(idx); }; })(items[j].index));
      tree.appendChild(el);
    }
  }
}

function loadFile(index) {
  currentIndex = index;
  var f = leanFiles[index];
  var treeItems = document.querySelectorAll('#book-tree .tree-file');
  for (var i = 0; i < treeItems.length; i++) {
    treeItems[i].classList.toggle('active', parseInt(treeItems[i].getAttribute('data-index')) === index);
  }
  if (typeof marked !== 'undefined') { marked.use({ gfm: true, breaks: true }); }
  var nb = document.getElementById('notebook');
  nb.innerHTML = '';
  var rawPre = document.getElementById('lean-raw-pre');
  rawPre.innerHTML = hlLean(f.content);
  var blocks = parseLean(f.content);
  renderBlocksSeq(blocks, nb, 0, function() {
    var tocHtml = '', hi = 0;
    var headings = nb.querySelectorAll('h1,h2,h3');
    for (var h = 0; h < headings.length; h++) {
      var id = 'h' + hi++; headings[h].id = id;
      tocHtml += '<a href="#' + id + '" class="' + headings[h].tagName.toLowerCase() + '">' + headings[h].textContent + '</a>\\n';
    }
    document.getElementById('toc').innerHTML = tocHtml;
    var h1 = nb.querySelector('h1');
    if (h1) {
      document.getElementById('doc-title').textContent = h1.textContent;
      document.title = h1.textContent + ' \\u2014 Lean Notebook';
    } else {
      document.getElementById('doc-title').textContent = f.name;
      document.title = f.name + ' \\u2014 Lean Notebook';
    }
    typesetMath(nb);
  });
  document.getElementById('notebook').style.display = '';
  document.getElementById('lean-raw').style.display = 'none';
  document.getElementById('vhtml').checked = true;
}

function renderBlocksSeq(blocks, nb, i, done) {
  if (i >= blocks.length) { done(); return; }
  var b = blocks[i];
  if (b.type === 'module-doc' || b.type === 'doc-comment') {
    var cls = b.type === 'module-doc' ? 'block-module-doc' : 'block-doc-comment';
    var el = document.createElement('div');
    el.className = cls;
    el.innerHTML = mdToHtml(b.content);
    var codes = el.querySelectorAll('pre code');
    for (var c = 0; c < codes.length; c++) {
      if (codes[c].classList.contains('language-lean') || codes[c].classList.contains('language-lean4')) {
        codes[c].innerHTML = hlLean(codes[c].textContent || '');
      }
    }
    nb.appendChild(el);
    renderBlocksSeq(blocks, nb, i + 1, done);
  } else if (b.type === 'code') {
    var el2 = document.createElement('div');
    el2.className = 'block-code';
    el2.innerHTML = '<div class="block-code-header">lean4</div><pre class="lean-source">' + hlLean(b.source) + '</pre>';
    nb.appendChild(el2);
    renderBlocksSeq(blocks, nb, i + 1, done);
  } else if (b.type === 'mermaid') {
    var wrap = document.createElement('div');
    wrap.className = 'block-mermaid';
    nb.appendChild(wrap);
    renderMermaid(b.source, wrap).then(function() { renderBlocksSeq(blocks, nb, i + 1, done); });
  } else if (b.type === 'graphviz') {
    var wrap2 = document.createElement('div');
    wrap2.className = 'block-graphviz';
    nb.appendChild(wrap2);
    renderGraphviz(b.source, wrap2).then(function() { renderBlocksSeq(blocks, nb, i + 1, done); });
  } else {
    renderBlocksSeq(blocks, nb, i + 1, done);
  }
}

document.querySelectorAll('input[name="view"]').forEach(function(radio) {
  radio.addEventListener('change', function() {
    var nb = document.getElementById('notebook');
    var leanRaw = document.getElementById('lean-raw');
    if (radio.value === 'lean') { nb.style.display = 'none'; leanRaw.style.display = 'block'; }
    else { nb.style.display = ''; leanRaw.style.display = 'none'; }
  });
});
`;

    // Build the complete HTML
    const html = [
        '<!DOCTYPE html>',
        '<html lang="en">',
        '<head>',
        '<meta charset="UTF-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        '<title>' + bookTitle + ' — Lean Notebook</title>',
        '<script>MathJax = ' + mathJaxConfigJson + ';<' + '/script>',
        '<script>' + esc(texSvgJs) + '<' + '/script>',
        '<script>' + esc(markedJs) + '<' + '/script>',
        '<script>' + esc(mermaidJs) + '<' + '/script>',
        '<script>' + esc(vizJs) + '<' + '/script>',
        '<style>' + styleCss + '</style>',
        '<style>' + viewerCss + '</style>',
        '</head>',
        '<body>',
        // Embedded lean sources
        ...leanScriptTags,
        // Landing (shown briefly if no files)
        '<div id="landing"><h1>lean <span style="font-weight:300;color:var(--blue)">notebook</span></h1><p>Loading…</p></div>',
        // Book sidebar
        '<nav id="book-sidebar"><div class="book-header"><div class="logo">lean<span> notebook</span></div><div class="book-title" id="book-title">' + bookTitle + '</div></div><div id="book-tree"></div></nav>',
        // Page area
        '<div id="page-area"><div id="app">',
        '<div id="topbar"><div class="logo">lean<span> notebook</span></div><div class="sep">\u00b7</div><div class="doc-title" id="doc-title"></div>',
        '<div id="view-toggle"><input type="radio" name="view" id="vlean" value="lean"><label for="vlean">lean</label><input type="radio" name="view" id="vhtml" value="html" checked><label for="vhtml">HTML</label></div></div>',
        '<nav id="sidebar"><div id="toc-label">Contents</div><div id="toc"></div></nav>',
        '<main id="notebook"></main>',
        '<div id="lean-raw"><pre id="lean-raw-pre"></pre></div>',
        '</div></div>',
        // Scripts
        '<script>' + esc(rendererJs) + '<' + '/script>',
        '<script>' + esc(viewerJs) + '<' + '/script>',
        '</body>',
        '</html>'
    ].join('\n');

    return html;
}
