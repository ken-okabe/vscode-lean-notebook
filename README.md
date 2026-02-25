# LeanNotebook — VS Code Extension

A VS Code extension that transforms Lean 4 source files (`.lean`) into richly rendered interactive notebooks with LaTeX math, Mermaid diagrams, and Graphviz visualizations. Designed for **Lean programmers** and **Literate Coding** authors.

## Features

- **Live Preview**: Real-time rendered preview of `.lean` files as rich notebooks inside VS Code
- **Literate Programming**: Module doc comments (`/--  --/`) and doc comments (`/--  -/`) rendered as Markdown with full math support
- **LaTeX Math**: Inline `$...$` and display `$$...$$` math via MathJax 4
- **Mermaid Diagrams**: Fenced ` ```mermaid ` blocks rendered as diagrams
- **Graphviz**: Fenced ` ```graphviz ` blocks rendered as DOT graphs
- **Lean Syntax Highlighting**: Code blocks highlighted with Lean-aware tokenizer
- **HTML Export**: Export individual files or entire directories as standalone offline HTML

## HTML Export

From the VS Code command palette or the **Export HTML** button:

### Single File Export
Creates a self-contained directory:
```
FileName/
  index.html          ← open in browser
  _libs/              ← rendering libraries
```

### Directory Export
Exports all `.lean` files with two output formats under one parent:
```
DirName/
  DirName_Separate_HTML/
    _libs/
    Contents/
      Module1/file1.html   ← individual HTML pages
      Module2/file2.html

  DirName_Lean_Viewer/
    Viewer.html            ← Book Viewer app (open in browser)
    _libs/
    Contents/
      Module1/file1.lean   ← original .lean source files
      Module2/file2.lean
```

**Separate HTML** — Each `.lean` file exported as a standalone HTML page with embedded renderer.

**Lean Viewer** — A single-page Book Viewer web app. Open `Viewer.html`, select the `Contents` folder, and browse all files with a navigable table of contents. Renders `.lean` source directly in the browser.

Both formats work **fully offline** — no internet connection or server required.

## Library Dependencies

All rendering libraries are bundled locally in `media/_libs/`. No CDN dependency at runtime.

| Library | Version | Purpose |
|---|---|---|
| [MathJax](https://www.mathjax.org/) | 4.1.1 | LaTeX math rendering |
| [marked](https://marked.js.org/) | 17.0.3 | Markdown → HTML |
| [mermaid](https://mermaid.js.org/) | 11.12.3 | Diagram rendering |
| [@viz-js/viz](https://viz-js.com/) | 3.24.0 | Graphviz DOT rendering |

## Rendering Guarantee

The VS Code WebView and all exported HTML use the **exact same files** from `media/_libs/`, `renderer.js`, and `style.css`. Rendering output is identical across all environments:

| Component | Extension WebView | Exported HTML / Viewer |
|---|---|---|
| Libraries | `media/_libs/` via `webviewUri` | `_libs/` (copy) |
| Renderer | `media/renderer.js` via `webviewUri` | `renderer.js` (inlined) |
| Styles | `media/style.css` via `<link>` | `style.css` (inlined) |
| MathJax config | Extracted from `renderer.js` | Same extraction |
