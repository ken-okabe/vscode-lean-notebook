import * as fs from 'fs';
import * as pathModule from 'path';
import * as vscode from 'vscode';
import { generateBlockId } from './utils/hashing';

import { splitLeanDocComments, expandCommentBlock } from './leanCommentParser';
import { leanLspManager } from './leanLspClient';

export type NotebookBlock = (ModuleDocBlock | DocCommentBlock | CodeBlock | MermaidBlock | GraphvizBlock | SvgFileBlock) & { id: string };

export interface MermaidBlock {
    type: 'mermaid';
    source: string;
    range: {
        startLine: number;
        endLine: number;
    };
}

export interface GraphvizBlock {
    type: 'graphviz';
    source: string;
    range: {
        startLine: number;
        endLine: number;
    };
}

export interface ModuleDocBlock {
    type: 'module-doc';
    content: string;
    range: {
        startLine: number;
        endLine: number;
    };
}

export interface DocCommentBlock {
    type: 'doc-comment';
    content: string;
    symbolName?: string;
    symbolKind?: any;
    range: {
        startLine: number;
        endLine: number;
    };
}

export interface BlockOutput {
    line: number; // 0-based relative to the start of the code block
    content: string;
    severity: number;
}

export interface CodeBlock {
    type: 'code';
    source: string;
    outputs?: BlockOutput[];
    range: {
        startLine: number;
        endLine: number;
    };
}

export interface SvgFileBlock {
    type: 'svg-file';
    path: string;
    content?: string;
    range: {
        startLine: number;
        endLine: number;
    };
}

/**
 * Build notebook blocks for a Lean4 file.
// ... (omitting unchanged comments for brevity if possible, but tool requires context match)
 * - The structural split into `/ -! ... -/` (module docs), `/-- ... -/` (doc comments), and code blocks
 *   is currently done by a lightweight *textual lexer* (`splitLeanDocComments`).
 *   This is NOT the official Lean parser, and it can be sensitive to edge-cases.
 *   Therefore we keep regression tests in `scripts/test-lean-comment-parser.js`.
 *
 * - We still rely on the running Lean language server (via VS Code diagnostics) to attach execution
 *   results such as `#eval` outputs.
 */
export async function parseLeanFileWithLSP(
    document: vscode.TextDocument
): Promise<NotebookBlock[]> {
    console.log('[Notebook Parser] Starting parse for:', document.fileName);

    // Phase 1 (lexical): split /-! and /-- blocks from code using a textual scan.
    const lex = splitLeanDocComments(document.getText(), document);
    console.log(`[Notebook Parser] Lexical split: ${lex.length} blocks`);

    // Phase 1.5: Expand comment blocks to extract mermaid diagrams
    const expandedLex = lex.flatMap(b => expandCommentBlock(b));
    console.log(`[Notebook Parser] After mermaid expansion: ${expandedLex.length} blocks`);

    // Debug: log diagram blocks
    const diagramBlocks = expandedLex.filter(b => b.type === 'mermaid' || b.type === 'graphviz');
    if (diagramBlocks.length > 0) {
        console.log(`[Notebook Parser] Found ${diagramBlocks.length} diagram blocks`);
        diagramBlocks.forEach((b, i) => {
            if (b.type === 'mermaid' || b.type === 'graphviz') {
                console.log(`[Notebook Parser] ${b.type} ${i}: ${b.source.substring(0, 50)}...`);
            }
        });
    }

    // ID Generation Context
    const occurrenceMap = new Map<string, number>();

    const blocks: NotebookBlock[] = expandedLex.map(b => {
        // Generate Stable ID
        // key = type + content
        // We accumulate occurrences to distinguish identical blocks
        const contentKey = b.type === 'code' || b.type === 'mermaid' || b.type === 'graphviz'
            ? b.source
            : b.type === 'svg-file'
                ? (b as any).path
                : b.content;
        const key = `${b.type}:${contentKey}`;
        const count = occurrenceMap.get(key) || 0;
        occurrenceMap.set(key, count + 1);

        const id = generateBlockId(b.type, contentKey, count);

        if (b.type === 'code') {
            return { type: 'code', source: b.source, outputs: [], range: b.range, id };
        }
        if (b.type === 'module-doc') {
            return { type: 'module-doc', content: b.content, range: b.range, id };
        }
        if (b.type === 'mermaid') {
            return { type: 'mermaid', source: b.source, range: b.range, id };
        }
        if (b.type === 'graphviz') {
            return { type: 'graphviz', source: b.source, range: b.range, id };
        }
        if (b.type === 'svg-file') {
            return { type: 'svg-file', path: (b as any).path, range: b.range, id };
        }
        return { type: 'doc-comment', content: b.content, range: b.range, id };
    });


    // Phase 2 (LSP/Lean server): Start the LSP client and ensure document is opened.
    // This triggers elaboration and diagnostics (including #eval results).
    // Strategy: If the official Lean4 extension is active, rely on its diagnostics.
    // Otherwise, start our own LSP client.
    const officialLean4Extension = vscode.extensions.getExtension('leanprover.lean4');
    const useOfficialExtension = officialLean4Extension && officialLean4Extension.isActive;

    if (useOfficialExtension) {
        console.log('[Notebook Parser] Official Lean4 extension is active; using its diagnostics');
    } else {
        console.log('[Notebook Parser] Official Lean4 extension not found/inactive; starting our own LSP client');
        try {
            await leanLspManager.getClientForDocument(document);
            console.log('[Notebook Parser] LSP client started/ensured for document');
        } catch (error) {
            console.error('[Notebook Parser] Failed to start LSP client:', error);
        }
    }

    // Phase 3: Attach diagnostics (execution results like #eval) to code blocks.
    await attachDiagnostics(document, blocks);

    // Phase 4: Load SVG file content for svg-file blocks.
    await loadSvgFiles(document, blocks);

    // Phase 5: Inline SVG replacement for @svg markers inside markdown content
    // (e.g. inside table cells where splitDiagramBlocks doesn't extract them)
    inlineSvgContent(document, blocks);

    return blocks;
}

/**
 * Attach diagnostics (like #eval results) and proof status to code blocks.
 *
 * - Information diagnostics (e.g. #eval) → rendered as "-- Evaluated: ..."
 * - theorem/lemma/example declarations with no errors → rendered as "-- ✓"
 */
export async function attachDiagnostics(
    document: vscode.TextDocument,
    blocks: NotebookBlock[]
): Promise<void> {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    console.log(`[attachDiagnostics] Got ${diagnostics.length} diagnostics from VS Code for ${document.uri.fsPath}`);

    // Only attach proof status if Lean has actually processed the file
    // (i.e., there are diagnostics OR the file is small/trivial).
    const hasDiagnostics = diagnostics.length > 0;

    // Regex to detect theorem/lemma/example declarations at the start of a line
    const proofDeclPattern = /^\s*(?:private\s+|protected\s+)?(?:noncomputable\s+)?(?:theorem|lemma|example)\b/;

    for (const block of blocks) {
        if (block.type !== 'code') continue;

        // Find diagnostics that fall within this code block
        const blockDiagnostics = diagnostics.filter(diag =>
            diag.range.start.line >= block.range.startLine &&
            diag.range.end.line <= block.range.endLine
        );

        // Extract #eval results or other info messages
        const outputs: BlockOutput[] = [];
        for (const diag of blockDiagnostics) {
            if (diag.severity === vscode.DiagnosticSeverity.Information) {
                const relativeLine = diag.range.start.line - block.range.startLine;
                outputs.push({
                    line: relativeLine,
                    content: diag.message,
                    severity: diag.severity
                });
            }
        }

        // Detect theorem/lemma/example declarations and check for proof success
        if (hasDiagnostics) {
            const lines = block.source.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
                if (proofDeclPattern.test(lines[i])) {
                    const absoluteLine = block.range.startLine + i;

                    // Check if any error diagnostic touches this declaration
                    const hasError = blockDiagnostics.some(diag =>
                        diag.severity === vscode.DiagnosticSeverity.Error &&
                        diag.range.start.line <= absoluteLine &&
                        diag.range.end.line >= absoluteLine
                    );

                    if (!hasError) {
                        outputs.push({
                            line: i,
                            content: '✓',
                            severity: -1  // Special marker for proof-ok
                        });
                    }
                }
            }
        }

        if (outputs.length > 0) {
            console.log(`[attachDiagnostics] Attached ${outputs.length} outputs to code block at lines ${block.range.startLine}-${block.range.endLine}`);
            block.outputs = outputs;
        }
    }
}

/**
 * Find the nearest lake project root for a document.
 * Walks up from the document's directory looking for lakefile.lean or lakefile.toml.
 */
function findLakeRoot(docPath: string): string | null {
    let dir = pathModule.dirname(docPath);
    while (true) {
        if (fs.existsSync(pathModule.join(dir, 'lakefile.lean')) ||
            fs.existsSync(pathModule.join(dir, 'lakefile.toml'))) {
            return dir;
        }
        const parent = pathModule.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}

/**
 * Load SVG file content for svg-file blocks.
 * Resolves paths relative to _svg_<leanFilename>/ directory in the same location as the .lean file.
 */
async function loadSvgFiles(
    document: vscode.TextDocument,
    blocks: NotebookBlock[]
): Promise<void> {
    const svgBlocks = blocks.filter(b => b.type === 'svg-file') as (SvgFileBlock & { id: string })[];
    if (svgBlocks.length === 0) return;

    const docPath = document.uri.fsPath;
    const docDir = pathModule.dirname(docPath);
    const docBaseName = pathModule.basename(docPath, '.lean');
    const svgDir = pathModule.join(docDir, `_svg_${docBaseName}`);

    for (const block of svgBlocks) {
        const svgPath = pathModule.join(svgDir, block.path);
        try {
            if (fs.existsSync(svgPath)) {
                block.content = fs.readFileSync(svgPath, 'utf8');
                console.log(`[loadSvgFiles] Loaded: ${block.path} from ${svgDir}`);
            } else {
                console.log(`[loadSvgFiles] Not found: ${svgPath}`);
                block.content = undefined;
            }
        } catch (e) {
            console.error(`[loadSvgFiles] Error reading ${svgPath}:`, e);
            block.content = undefined;
        }
    }
}

/**
 * Replace inline @svg markers in markdown content with base64-encoded img tags.
 * This handles @svg markers that weren't extracted by splitDiagramBlocks,
 * e.g. inside table cells: | @svg file.svg | @svg other.svg |
 * Uses base64 <img> tags instead of raw SVG to avoid breaking markdown table syntax.
 */
function inlineSvgContent(
    document: vscode.TextDocument,
    blocks: NotebookBlock[]
): void {
    const docPath = document.uri.fsPath;
    const docDir = pathModule.dirname(docPath);
    const docBaseName = pathModule.basename(docPath, '.lean');
    const svgDir = pathModule.join(docDir, `_svg_${docBaseName}`);
    const svgInlineRe = /@svg\s+([\w.\-]+)/g;

    for (const block of blocks) {
        if ((block.type === 'module-doc' || block.type === 'doc-comment') && (block as any).content) {
            const content = (block as any).content as string;
            if (!svgInlineRe.test(content)) continue;
            svgInlineRe.lastIndex = 0;

            (block as any).content = content.replace(svgInlineRe, (_match: string, filename: string) => {
                const svgPath = pathModule.join(svgDir, filename.trim());
                try {
                    if (fs.existsSync(svgPath)) {
                        const svgContent = fs.readFileSync(svgPath, 'utf8');
                        const b64 = Buffer.from(svgContent).toString('base64');
                        return `<img src="data:image/svg+xml;base64,${b64}" alt="${filename.trim()}" style="max-width:100%">`;
                    }
                } catch { /* ignore */ }
                return `*SVG not found: ${filename.trim()}*`;
            });
        }
    }
}
