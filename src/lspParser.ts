import * as vscode from 'vscode';

import { splitLeanDocComments, expandCommentBlock } from './leanCommentParser';
import { leanLspManager } from './leanLspClient';

export type NotebookBlock = ModuleDocBlock | DocCommentBlock | CodeBlock | MermaidBlock;

export interface MermaidBlock {
    type: 'mermaid';
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
    document: vscode.TextDocument,
    onUpdate?: (blocks: NotebookBlock[]) => void
): Promise<NotebookBlock[]> {
    console.log('[Notebook Parser] Starting parse for:', document.fileName);

    // Phase 1 (lexical): split /-! and /-- blocks from code using a textual scan.
    const lex = splitLeanDocComments(document.getText(), document);
    console.log(`[Notebook Parser] Lexical split: ${lex.length} blocks`);

    // Phase 1.5: Expand comment blocks to extract mermaid diagrams
    const expandedLex = lex.flatMap(b => expandCommentBlock(b));
    console.log(`[Notebook Parser] After mermaid expansion: ${expandedLex.length} blocks`);

    // Debug: log mermaid blocks
    const mermaidBlocks = expandedLex.filter(b => b.type === 'mermaid');
    if (mermaidBlocks.length > 0) {
        console.log(`[Notebook Parser] Found ${mermaidBlocks.length} mermaid blocks`);
        mermaidBlocks.forEach((b, i) => {
            if (b.type === 'mermaid') {
                console.log(`[Notebook Parser] Mermaid ${i}: ${b.source.substring(0, 50)}...`);
            }
        });
    }

    const blocks: NotebookBlock[] = expandedLex.map(b => {
        if (b.type === 'code') {
            return { type: 'code', source: b.source, outputs: [], range: b.range };
        }
        if (b.type === 'module-doc') {
            return { type: 'module-doc', content: b.content, range: b.range };
        }
        if (b.type === 'mermaid') {
            return { type: 'mermaid', source: b.source, range: b.range };
        }
        return { type: 'doc-comment', content: b.content, range: b.range };
    });

    // IMMEDIATE UPDATE: Send preliminary blocks (no execution results yet)
    if (onUpdate) {
        console.log('[Notebook Parser] Triggering immediate update with lexical blocks');
        onUpdate([...blocks]); // Send a copy
    }

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
    return blocks;
}

/**
 * Attach diagnostics (like #eval results) to code blocks
 */
async function attachDiagnostics(
    document: vscode.TextDocument,
    blocks: NotebookBlock[]
): Promise<void> {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    console.log(`[attachDiagnostics] Got ${diagnostics.length} diagnostics from VS Code for ${document.uri.fsPath}`);

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

        if (outputs.length > 0) {
            console.log(`[attachDiagnostics] Attached ${outputs.length} outputs to code block at lines ${block.range.startLine}-${block.range.endLine}`);
            block.outputs = outputs;
        }
    }
}
