export type NotebookBlock = MarkdownBlock | CodeBlock;

export interface MarkdownBlock {
    type: 'markdown';
    content: string;
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
 * Naive Regex Parser for Lean 4
 * Splits content by `/-!` (Module Doc) or `/--` (Docstring).
 * Note: This doesn't handle nested comments perfectly but suffices for Phase 1.
 */
export function parseLeanFile(content: string): NotebookBlock[] {
    const blocks: NotebookBlock[] = [];
    const lines = content.split('\n');
    let currentBlockStartLine = 0;

    // We'll iterate through the string to find comment blocks.
    // Regex for block comments: \/-! (.*?) -\/ or \/-- (.*?) -\/
    // Since JS regex doesn't support 'dot matches newline' strictly without 's' flag which might over-consume,
    // we'll stick to a simple split approach or regex loop.

    // Pattern:
    // Group 1: Opening delimiter (/-! or /--)
    // Group 2: Content
    // Group 3: Closing delimiter (-/)
    const regex = /(\/-!|\/--)([\s\S]*?)(\-\/)/g;

    let match;
    let lastIndex = 0;

    while ((match = regex.exec(content)) !== null) {
        // 1. Everything before this match is CODE (if not empty)
        const codeContent = content.substring(lastIndex, match.index);
        if (codeContent.trim().length > 0) {
            // Calculate start/end lines for code block
            const preLines = content.substring(0, lastIndex).split('\n');
            const startLine = preLines.length; // 1-based, approx
            const codeLinesCount = codeContent.split('\n').length - 1;

            blocks.push({
                type: 'code',
                source: codeContent, // trim? maybe not to preserve indentation
                output: undefined,
                range: {
                    startLine: startLine,
                    endLine: startLine + codeLinesCount
                }
            });
        }

        // 2. The match itself is MARKDOWN
        // match[2] is the content inside the comment
        blocks.push({
            type: 'markdown',
            content: match[2] // raw markdown content
        });

        lastIndex = regex.lastIndex;
    }

    // 3. Remaining content is CODE
    if (lastIndex < content.length) {
        const remaining = content.substring(lastIndex);
        if (remaining.trim().length > 0) {
            const preLines = content.substring(0, lastIndex).split('\n');
            const startLine = preLines.length;
            const codeLinesCount = remaining.split('\n').length - 1;

            blocks.push({
                type: 'code',
                source: remaining,
                range: {
                    startLine: startLine,
                    endLine: startLine + codeLinesCount
                }
            });
        }
    }

    return blocks;
}
