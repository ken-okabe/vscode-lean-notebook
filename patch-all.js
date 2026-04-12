const fs = require('fs');
let code = fs.readFileSync('src/htmlExporter.ts', 'utf8');

// Build Viewer Replacement
let idx1 = code.indexOf('function buildViewerHtml');
let endIdx1 = code.indexOf('function buildAllInOneHtml', idx1);
let chunk1 = code.substring(idx1, endIdx1);

const oldVStart = chunk1.indexOf('const viewerJs = `');
const oldVEnd = chunk1.indexOf('`;', oldVStart) + 2;

const newV1 = `const viewerJs = \`
var currentIndex = -1;

function loadFile(index) {
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

  var blocks = LeanParser.parseLean(f.content);
  if (typeof window.loadBlocks === 'function') {
      window.loadBlocks(blocks);
  }
}

// Ensure toggles still work even without the manual view hide
function updateViewMode() {
    // Let main.js handle the CSS or we do it manually, wait, main.js does NOT handle leanRaw view switching right now!
    // But we added leanRaw viewing in the HTML exports manually in boot
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
\`;`;

chunk1 = chunk1.substring(0, oldVStart) + newV1 + chunk1.substring(oldVEnd);
code = code.substring(0, idx1) + chunk1 + code.substring(endIdx1);


// Build All-In-One Replacement
let idx2 = code.indexOf('function buildAllInOneHtml');
let chunk2 = code.substring(idx2);

const oldV2Start = chunk2.indexOf('const viewerJs = `');
const oldV2End = chunk2.indexOf('`;', oldV2Start) + 2;

const newV2 = `const viewerJs = \`
var leanFiles = [];
var currentIndex = -1;

(function boot() {
  var tags = document.querySelectorAll('script[type="text/x-lean-source"]');
  for (var i = 0; i < tags.length; i++) {
    leanFiles.push({ path: tags[i].getAttribute('data-path'), name: tags[i].getAttribute('data-path').split('/').pop(), content: tags[i].textContent });
  }
  if (leanFiles.length > 0) {
    var tree = document.getElementById('book-tree');
    leanFiles.forEach(function(f, idx) {
      var pt = document.createElement('div'); pt.className = 'tree-item tree-file'; pt.setAttribute('data-index', idx);
      var link = document.createElement('a'); link.textContent = f.name; link.href = '#'; link.onclick = function(e) { e.preventDefault(); loadFile(idx); };
      pt.appendChild(link); tree.appendChild(pt);
    });
    loadFile(0);
  }
})();

function loadFile(index) {
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

  var blocks = LeanParser.parseLean(f.content);
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
\`;`;

chunk2 = chunk2.substring(0, oldV2Start) + newV2 + chunk2.substring(oldV2End);

// Add missing libraries to All-In-One:
chunk2 = chunk2.replace(
  "const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));\n  const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));",
  "const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));\n  const vanJs = readLib(path.join(mediaDir, 'van.min.js'));\n  const parserJs = readLib(path.join(mediaDir, 'leanCommentParser.js'));\n  const mainJs = readLib(path.join(mediaDir, 'main.js'));\n  const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));"
);
chunk2 = chunk2.replace(
  "'<script>' + esc(rendererJs) + '<' + '/script>',\n    '<script>' + esc(viewerJs) + '<' + '/script>',",
  "'<script>' + esc(vanJs) + '<' + '/script>',\n    '<script>' + esc(parserJs) + '<' + '/script>',\n    '<script>' + esc(rendererJs) + '<' + '/script>',\n    '<script>' + esc(mainJs) + '<' + '/script>',\n    '<script>' + esc(viewerJs) + '<' + '/script>',"
);
code = code.substring(0, idx2) + chunk2;

fs.writeFileSync('src/htmlExporter.ts', code);
console.log('Done Viewer & All-In-One');
