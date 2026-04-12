const fs = require('fs');
let code = fs.readFileSync('src/htmlExporter.ts', 'utf8');

// Build Single File Replacement
let idx = code.indexOf('function buildSingleFileHtml');
let endIdx = code.indexOf('function buildViewerHtml', idx);
let chunk = code.substring(idx, endIdx);

const oldViewerJsStart = chunk.indexOf('const viewerJs = `');
const oldViewerJsEnd = chunk.indexOf('`;', oldViewerJsStart) + 2;

const newViewerJs = `const viewerJs = \`
var leanFiles = [];
var currentIndex = -1;

(function boot() {
  var tags = document.querySelectorAll('script[type="text/x-lean-source"]');
  for (var i = 0; i < tags.length; i++) {
    leanFiles.push({ path: tags[i].getAttribute('data-path'), name: tags[i].getAttribute('data-path').split('/').pop(), content: tags[i].textContent });
  }
  if (leanFiles.length > 0) {
    loadFile(0);
  }
})();

function loadFile(index) {
  currentIndex = index;
  var f = leanFiles[index];
  
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
\`;`;

chunk = chunk.substring(0, oldViewerJsStart) + newViewerJs + chunk.substring(oldViewerJsEnd);

// Add missing libraries to SingleFile:
chunk = chunk.replace(
  "const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));\n  const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));",
  "const texSvgJs = readLib(path.join(libsDir, 'tex-svg.js'));\n  const vanJs = readLib(path.join(mediaDir, 'van.min.js'));\n  const parserJs = readLib(path.join(mediaDir, 'leanCommentParser.js'));\n  const mainJs = readLib(path.join(mediaDir, 'main.js'));\n  const rendererJs = readLib(path.join(mediaDir, 'renderer.js'));"
);

chunk = chunk.replace(
  "'<script>' + esc(rendererJs) + '<' + '/script>',\n    '<script>' + esc(viewerJs) + '<' + '/script>',",
  "'<script>' + esc(vanJs) + '<' + '/script>',\n    '<script>' + esc(parserJs) + '<' + '/script>',\n    '<script>' + esc(rendererJs) + '<' + '/script>',\n    '<script>' + esc(mainJs) + '<' + '/script>',\n    '<script>' + esc(viewerJs) + '<' + '/script>',"
);

code = code.substring(0, idx) + chunk + code.substring(endIdx);
fs.writeFileSync('src/htmlExporter.ts', code);
console.log('Done Single');
