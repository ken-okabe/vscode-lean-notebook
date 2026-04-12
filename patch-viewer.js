const fs = require('fs');
let code = fs.readFileSync('/tmp/htmlExporter.ts.bak', 'utf8');

let idx1 = code.indexOf('function buildViewerHtml');
let endIdx1 = code.indexOf('function buildAllInOneHtml', idx1);
let chunk1 = code.substring(idx1, endIdx1);

// Find the start of `function loadFile(index)`
const oldLIdx = chunk1.indexOf('function loadFile(index) {');
const oldVEnd = chunk1.indexOf('`;', oldLIdx);

const newL = `function loadFile(index) {
  currentIndex = index;
  var f = leanFiles[index];
  var treeItems = document.querySelectorAll('#book-tree .tree-file');
  for (var i = 0; i < treeItems.length; i++) {
    treeItems[i].classList.toggle('active', parseInt(treeItems[i].getAttribute('data-index')) === index);
  }
  
  var titleEl = document.getElementById('doc-title');
  if (titleEl) {
    titleEl.textContent = f.name;
    document.title = f.name + ' \\u2014 Lean Notebook';
  }

  var rawPre = document.getElementById('lean-raw-pre');
  if (rawPre && typeof hlLean === 'function') {
      rawPre.innerHTML = hlLean(f.content);
  }

  var blocks = window.LeanParser.parseLean(f.content);
  if (typeof window.loadBlocks === 'function') {
      window.loadBlocks(blocks);
  }
}

function updateViewMode() {
    var isLean = document.getElementById('vlean').checked;
    var nb = document.getElementById('notebook');
    var raw = document.getElementById('lean-raw');
    if (nb) nb.style.display = isLean ? 'none' : '';
    if (raw) raw.style.display = isLean ? 'block' : 'none';
}
document.addEventListener('DOMContentLoaded', () => {
    let modeRadios = document.querySelectorAll('input[name="view"]');
    modeRadios.forEach(r => r.addEventListener('change', updateViewMode));
});
`;

chunk1 = chunk1.substring(0, oldLIdx) + newL + chunk1.substring(oldVEnd);

// Add missing libraries to Viewer:
chunk1 = chunk1.replace(
  "const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));\n  const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));",
  "const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));\n  const vanJs = readLib(path.join(mediaDir, 'van.min.js'));\n  const parserJs = readLib(path.join(mediaDir, 'leanCommentParser.js'));\n  const mainJs = readLib(path.join(mediaDir, 'main.js'));\n  const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));"
);

chunk1 = chunk1.replace(
  "'<script>' + esc(rendererJs) + '<' + '/script>',\n    '<script>' + esc(viewerJs) + '<' + '/script>',",
  "'<script>' + esc(vanJs) + '<' + '/script>',\n    '<script>' + esc(parserJs) + '<' + '/script>',\n    '<script>' + esc(rendererJs) + '<' + '/script>',\n    '<script>' + esc(mainJs) + '<' + '/script>',\n    '<script>' + esc(viewerJs) + '<' + '/script>',"
);

// Apply it back to htmlExporter.ts (which already has buildSingleFileHtml and buildAllInOneHtml patched)
let targetCode = fs.readFileSync('src/htmlExporter.ts', 'utf8');
let targetIdx1 = targetCode.indexOf('function buildViewerHtml');
let targetEndIdx1 = targetCode.indexOf('function buildAllInOneHtml', targetIdx1);
targetCode = targetCode.substring(0, targetIdx1) + chunk1 + targetCode.substring(targetEndIdx1);
fs.writeFileSync('src/htmlExporter.ts', targetCode);
console.log('Fixed Viewer');
