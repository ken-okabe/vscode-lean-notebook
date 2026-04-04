# LeanNotebook — VS Code Extension

A VS Code extension that transforms Lean 4 source files (`.lean`) into richly rendered interactive notebooks with LaTeX math, Mermaid diagrams, and Graphviz visualizations. Designed for **Lean programmers** and **Literate Coding** authors.

## Features

- **Live Preview** — Real-time rendered preview of `.lean` files as rich notebooks inside VS Code
- **Literate Programming** — Module docs (`/-- ... -/`) and doc comments (`/-- ... -/`) rendered as Markdown
- **LaTeX Math** — Inline `$...$` and display `$$...$$` math via MathJax (SVG output)
- **Mermaid Diagrams** — Fenced ` ```mermaid ` blocks rendered as diagrams
- **Graphviz** — Fenced ` ```graphviz ` blocks rendered as DOT graphs
- **Lean Syntax Highlighting** — Code blocks highlighted with Lean-aware tokenizer
- **HTML Export** — Export individual files or entire Lean projects as standalone offline HTML

## Usage

### Status Bar Buttons

When a `.lean` file is open, two buttons appear in the **bottom-right** of the VS Code status bar:

| Button | Icon | Action |
|---|---|---|
| **Preview / Source** | `$(preview)` / `$(code)` | Toggle between the rendered notebook preview and raw Lean source |
| **HTML Export** | `$(export)` | Export the current file or an entire project as HTML |

### Preview

1. Open any `.lean` file
2. Click the **Preview** button (or run `LeanNotebook: Open Preview` from the Command Palette)
3. The rendered notebook opens in a side panel
4. Edits to the `.lean` file are reflected in real time
5. Click the **Source** button to return to the raw editor

### HTML Export

Click the **Export** button (or run `LeanNotebook: HTML Export` from the Command Palette). You will be prompted to choose:

#### Single File Export

Select **"Export current file"** — creates a **single self-contained HTML file** with all rendering libraries inlined:

```
FileName_lean.html   ← open in browser (no external files needed)
```

No `_libs/` folder is created. The file is completely standalone and can be shared as a single attachment.

#### Directory Export (Lean Project)

Select **"Export all .lean files in a directory…"** to export an entire Lean 4 project.

**Export flow:**

1. **Select Lean Project Directory** — choose the root of your Lean project (containing `lakefile.lean`, `lean-toolchain`, etc.)
2. **Enter export directory name** — defaults to the auto-detected project name (e.g. `CL8E8TQC`, detected from a root `.lean` file that has a matching subdirectory)
3. **Select output location** — choose where to write the export
4. **Confirm** — review the output structure and proceed

Four outputs are generated under one parent directory:

```
CL8E8TQC/
  CL8E8TQC_Separate_HTML/
    CL8E8TQC/
      _00_Introduction/
        _00_LiterateCoding_lean.html
        _01_Overview_lean.html
      _01_TQC/
        ...

  LeanProject/                   ← full project copy (.lake excluded)
    CL8E8TQC/
      _00_Introduction/
      _01_TQC/
      ...
    CL8E8TQC.lean
    lakefile.lean
    lean-toolchain
    lake-manifest.json

  LeanProjectViewer.html         ← self-contained Book Viewer app (~6 MB)

  CL8E8TQC_All_in_ONE.html      ← single self-contained file (~6 MB)
```

**Separate HTML** — Each `.lean` file as a standalone HTML page. Only content `.lean` files in subdirectories are exported; root-level project files (`lakefile.lean`, etc.) are excluded.

**LeanProject** — A copy of the entire Lean project source with the `.lake` build cache excluded. This allows recipients to build and verify the project with `lake build`.

**LeanProjectViewer** — A single self-contained Book Viewer HTML application with all rendering libraries inlined. Open the file in a browser, select your Lean project directory, and browse all files with a navigable sidebar and page table of contents. Root-level project files are automatically filtered out from the file tree.

**All-in-ONE** — A single self-contained HTML file with all libraries and all content `.lean` sources embedded. No external files or folders needed — just open in a browser.

All formats work **fully offline** — no internet connection or server required.

## Image Display

LeanNotebook can display images (SVG, PNG, JPEG, GIF, WebP) using `@image` markers in doc comments. Simply point to any image file using a path relative to the `.lean` file.

### Example

```lean
-- Your .lean file (e.g. MyDocument.lean)

-- 1. Generate or place image files anywhere relative to the .lean file
-- e.g. run a Lean program that writes images, or just put them manually

-- 2. Use @image markers in doc comments to display them
/-!
# My Diagrams

@image ./images/circle.svg

@image ./images/result.png

@image ../shared/diagram.jpg
-/
```

### `@image` Marker

Write `@image <path>` inside a doc comment (`/-! … -/` or `/-- … -/`). The path is **relative to the `.lean` file** and can point anywhere in the file system.

**Supported formats:** SVG, PNG, JPEG, GIF, WebP

You can also use Markdown tables for grid layouts:

```lean
/-!
| | |
|:---:|:---:|
| @image ./charts/a.png | @image ./charts/b.png |
| @image ./charts/c.svg | @image ./charts/d.svg |
-/
```

`@image` can be mixed freely with Markdown, Mermaid diagrams, and MathJax.

### HTML Export

When exporting to HTML, all image content is embedded as base64 data URIs directly into the output file. The exported HTML is fully self-contained — no external files needed.

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

All environments — Extension, Single File HTML, Separate HTML, LeanProjectViewer, All-in-ONE — load the same renderer, styles, and libraries. Rendering output is identical everywhere.

### Library Versions

| Library | Version |
|---|---|
| [MathJax](https://www.mathjax.org/) (tex-svg) | 4.1.1 |
| [marked](https://marked.js.org/) | 17.0.3 |
| [mermaid](https://mermaid.js.org/) | 11.12.3 |
| [@viz-js/viz](https://viz-js.com/) | 3.24.0 |
