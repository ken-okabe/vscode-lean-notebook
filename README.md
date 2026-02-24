# LeanNotebook — VS Code Extension

Lean 4 source files (`.lean`) to interactive HTML notebook viewer and exporter.

## Library Dependencies (`media/_libs/`)

All rendering libraries are stored locally in `media/_libs/` and used by both the Extension WebView and exported HTML. No CDN dependency at runtime.

| Library | Version | Size | Purpose |
|---|---|---|---|
| [MathJax](https://www.mathjax.org/) | **4.1.1** | 20MB | LaTeX math rendering |
| [marked](https://marked.js.org/) | **17.0.3** | 42KB | Markdown → HTML |
| [mermaid](https://mermaid.js.org/) | **11.12.3** | 2.8MB | Mermaid diagrams |
| [@viz-js/viz](https://viz-js.com/) | **3.24.0** | 1.4MB | Graphviz DOT diagrams |

## Rendering Guarantee — Single Source of Truth

The Extension WebView and exported HTML use the **exact same library files** from `media/_libs/`, guaranteeing identical rendering.

| Component | Extension WebView | Exported HTML |
|---|---|---|
| MathJax | `media/_libs/mathjax/tex-chtml.js` via `webviewUri` | `_libs/mathjax/tex-chtml.js` (copy) |
| marked | `media/_libs/marked.min.js` via `webviewUri` | `_libs/marked.min.js` (copy) |
| mermaid | `media/_libs/mermaid.min.js` via `webviewUri` | `_libs/mermaid.min.js` (copy) |
| viz.js | `media/_libs/viz-standalone.js` via `webviewUri` | `_libs/viz-standalone.js` (copy) |
| renderer.js | `media/renderer.js` via `webviewUri` | `media/renderer.js` inlined |
| style.css | `media/style.css` via `<link>` | `media/style.css` inlined |
| MathJax config | Extracted from `MATHJAX_CONFIG` in `renderer.js` | Same `MATHJAX_CONFIG` extraction |

**Flow:**
- **Extension:** `media/_libs/` → `webview.asWebviewUri()` → browser load
- **Export:** `media/_libs/` → `copyLibs()` → output directory copy → browser load

Same files, same versions, same config. Rendering output is identical and fully offline.

## HTML Export Structure

### Single file export
```
FileName/
  index.html
  _libs/          ← copied from media/_libs/
```

### Batch directory export
```
SourceDirName/
  _libs/          ← single copy at root
  Contents/
    Module1/
      file1.html
    Module2/
      file2.html
```
