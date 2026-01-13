export type NotebookBlock = MarkdownBlock | CodeBlock;

export interface MarkdownBlock {
    type: 'markdown';
    content: string;
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
 * Trim leading and trailing empty lines from code blocks
 * Preserves indentation and internal blank lines
 */
function trimEmptyLines(code: string): string {
    const lines = code.split('\n');
    
    // Find first non-empty line
    let start = 0;
    while (start < lines.length && lines[start].trim() === '') {
        start++;
    }
    
    // Find last non-empty line
    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim() === '') {
        end--;
    }
    
    // Return trimmed content
    if (start > end) {
        return ''; // All empty
    }
    
    return lines.slice(start, end + 1).join('\n');
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
                source: trimEmptyLines(codeContent),
                output: undefined,
                range: {
                    startLine: startLine,
                    endLine: startLine + codeLinesCount
                }
            });
        }

        // 2. The match itself is MARKDOWN
        // match[2] is the content inside the comment
        const preLines = content.substring(0, match.index).split('\n');
        const markdownStartLine = preLines.length;
        const markdownContent = match[0]; // Full match including delimiters
        const markdownLinesCount = markdownContent.split('\n').length - 1;
        
        blocks.push({
            type: 'markdown',
            content: match[2], // raw markdown content
            range: {
                startLine: markdownStartLine,
                endLine: markdownStartLine + markdownLinesCount
            }
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
                source: trimEmptyLines(remaining),
                range: {
                    startLine: startLine,
                    endLine: startLine + codeLinesCount
                }
            });
        }
    }

    return blocks;
}
