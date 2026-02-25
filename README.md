# LeanNotebook — VS Code Extension

A VS Code extension that transforms Lean 4 source files (`.lean`) into richly rendered interactive notebooks with LaTeX math, Mermaid diagrams, and Graphviz visualizations. Designed for **Lean programmers** and **Literate Coding** authors.

## Features

- **Live Preview** — Real-time rendered preview of `.lean` files as rich notebooks inside VS Code
- **Literate Programming** — Module docs (`/-- ... -/`) and doc comments (`/-- ... -/`) rendered as Markdown
- **LaTeX Math** — Inline `$...$` and display `$$...$$` math via MathJax (SVG output)
- **Mermaid Diagrams** — Fenced ` ```mermaid ` blocks rendered as diagrams
- **Graphviz** — Fenced ` ```graphviz ` blocks rendered as DOT graphs
- **Lean Syntax Highlighting** — Code blocks highlighted with Lean-aware tokenizer
- **HTML Export** — Export individual files or entire directories as standalone offline HTML

## Usage

### Status Bar Buttons

When a `.lean` file is open, two buttons appear in the **bottom-right** of the VS Code status bar:

| Button | Icon | Action |
|---|---|---|
| **Preview / Source** | `$(preview)` / `$(code)` | Toggle between the rendered notebook preview and raw Lean source |
| **HTML Export** | `$(export)` | Export the current file or an entire directory as HTML |

### Preview

1. Open any `.lean` file
2. Click the **Preview** button (or run `LeanNotebook: Open Preview` from the Command Palette)
3. The rendered notebook opens in a side panel
4. Edits to the `.lean` file are reflected in real time
5. Click the **Source** button to return to the raw editor

### HTML Export

Click the **Export** button (or run `LeanNotebook: HTML Export` from the Command Palette). You will be prompted to choose:

#### Single File Export
Select **"Export current file"** — creates a self-contained directory:
```
FileName/
  index.html        ← open in browser
  _libs/            ← rendering libraries
```

#### Directory Export
Select **"Export all .lean files in a directory…"** — select a source directory and an output location.
Three output formats are generated under one parent:
```
DirName/
  DirName_Separate_HTML/
    _libs/
    Contents/
      Module1/file1.html     ← individual HTML pages
      Module2/file2.html

  DirName_Lean_Viewer/
    Viewer.html              ← Book Viewer app
    _libs/
    Contents/
      Module1/file1.lean     ← original .lean files
      Module2/file2.lean

  DirName_All_in_ONE.html    ← single self-contained file (~6MB)
```

**Separate HTML** — Each `.lean` file as a standalone HTML page.

**Lean Viewer** — A Book Viewer web app. Open `Viewer.html`, select the `Contents` folder, and browse all files with a navigable sidebar and page table of contents.

**All-in-ONE** — A single self-contained HTML file (~6MB) with all libraries and all `.lean` sources embedded. No external files or folders needed — just open in a browser.

All formats work **fully offline** — no internet connection or server required.

## Architecture

### Rendering Pipeline (Single Source of Truth)

The VS Code WebView and all exported HTML use the **exact same files**:

| Component | Role |
|---|---|
| `media/renderer.js` | Lean parser, Markdown→HTML, syntax highlighter, MathJax/Mermaid/Graphviz integration |
| `media/style.css` | All visual styling (colors, layout, typography) |
| `media/_libs/tex-svg.js` | MathJax 4 — LaTeX → SVG rendering (no external fonts needed) |
| `media/_libs/marked.min.js` | Markdown → HTML |
| `media/_libs/mermaid.min.js` | Mermaid diagram rendering |
| `media/_libs/viz-standalone.js` | Graphviz DOT rendering |

All environments — Extension, Separate HTML, Lean Viewer, All-in-ONE — load the same renderer, styles, and libraries. Rendering output is identical everywhere.

### Library Versions

| Library | Version |
|---|---|
| [MathJax](https://www.mathjax.org/) (tex-svg) | 4.1.1 |
| [marked](https://marked.js.org/) | 17.0.3 |
| [mermaid](https://mermaid.js.org/) | 11.12.3 |
| [@viz-js/viz](https://viz-js.com/) | 3.24.0 |
