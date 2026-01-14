import * as vscode from 'vscode';

import { splitLeanDocComments } from './leanCommentParser';
import { leanLspManager } from './leanLspClient';

export type NotebookBlock = ModuleDocBlock | DocCommentBlock | CodeBlock;

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

export interface CodeBlock {
    type: 'code';
    source: string;
    output?: string;
    range: {
        startLine: number;
        endLine: number;
    };
}

/**
 * Build notebook blocks for a Lean4 file.
 *
 * IMPORTANT (design note):
 * - The structural split into `/ -! ... -/` (module docs), `/-- ... -/` (doc comments), and code blocks
 *   is currently done by a lightweight *textual lexer* (`splitLeanDocComments`).
 *   This is NOT the official Lean parser, and it can be sensitive to edge-cases.
 *   Therefore we keep regression tests in `scripts/test-lean-comment-parser.js`.
 *
 * - We still rely on the running Lean language server (via VS Code diagnostics) to attach execution
 *   results such as `#eval` outputs.
 */
export async function parseLeanFileWithLSP(document: vscode.TextDocument): Promise<NotebookBlock[]> {
    console.log('[Notebook Parser] Starting parse for:', document.fileName);

    // Phase 1 (lexical): split /-! and /-- blocks from code using a textual scan.
    const lex = splitLeanDocComments(document.getText(), document);
    const blocks: NotebookBlock[] = lex.map(b => {
        if (b.type === 'code') {
            return { type: 'code', source: b.source, output: undefined, range: b.range };
        }
        if (b.type === 'module-doc') {
            return { type: 'module-doc', content: b.content, range: b.range };
        }
        return { type: 'doc-comment', content: b.content, range: b.range };
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
        const outputs: string[] = [];
        for (const diag of blockDiagnostics) {
            if (diag.severity === vscode.DiagnosticSeverity.Information) {
                outputs.push(diag.message);
            }
        }
        
        if (outputs.length > 0) {
            console.log(`[attachDiagnostics] Attached ${outputs.length} outputs to code block at lines ${block.range.startLine}-${block.range.endLine}`);
            block.output = outputs.join('\n');
        }
    }
}
