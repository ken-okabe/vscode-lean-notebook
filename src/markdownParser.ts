import { generateBlockId } from './utils/hashing';
import { splitMarkdownSections } from './leanCommentParser';

/**
 * Parse Markdown files into blocks for notebook-style rendering
 */

export type MarkdownNotebookBlock = (TextBlock | CodeBlock | MermaidBlock) & { id: string };

export interface TextBlock {
    type: 'text';
    content: string;
}

export interface CodeBlock {
    type: 'code';
    language: string;
    source: string;
}

export interface MermaidBlock {
    type: 'mermaid';
    source: string;
}

/**
 * Trim leading and trailing empty lines from code blocks
 */
function trimEmptyLines(code: string): string {
    const lines = code.split('\n');

    let start = 0;
    while (start < lines.length && lines[start].trim() === '') {
        start++;
    }

    let end = lines.length - 1;
    while (end >= 0 && lines[end].trim() === '') {
        end--;
    }

    if (start > end) {
        return '';
    }

    return lines.slice(start, end + 1).join('\n');
}

/**
 * Parse a Markdown file into notebook blocks
 */
export function parseMarkdownFile(content: string): MarkdownNotebookBlock[] {
    // We use a temporary type for blocks before ID generation
    type RawBlock = TextBlock | CodeBlock | MermaidBlock;
    const blocks: RawBlock[] = [];

    // Regex to match fenced code blocks: ```language\n...code...\n```
    const codeBlockRegex = /^```(\w+)?\s*\n([\s\S]*?)^```\s*$/gm;

    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        // 1. Everything before this code block is TEXT
        const textContent = content.substring(lastIndex, match.index);
        if (textContent.trim().length > 0) {
            const sections = splitMarkdownSections(textContent);
            for (const sec of sections) {
                if (sec.trim().length > 0) {
                    blocks.push({
                        type: 'text',
                        content: sec.trim()
                    });
                }
            }
        }

        // 2. The matched code block
        const language = match[1] || '';
        const code = match[2];

        if (language.toLowerCase() === 'mermaid') {
            // Mermaid diagram
            blocks.push({
                type: 'mermaid',
                source: trimEmptyLines(code)
            });
        } else {
            // Regular code block
            blocks.push({
                type: 'code',
                language: language,
                source: trimEmptyLines(code)
            });
        }

        lastIndex = codeBlockRegex.lastIndex;
    }

    // 3. Remaining content is TEXT
    if (lastIndex < content.length) {
        const remaining = content.substring(lastIndex);
        if (remaining.trim().length > 0) {
            const sections = splitMarkdownSections(remaining);
            for (const sec of sections) {
                if (sec.trim().length > 0) {
                    blocks.push({
                        type: 'text',
                        content: sec.trim()
                    });
                }
            }
        }
    }

    // Generate Stable IDs
    const occurrenceMap = new Map<string, number>();

    return blocks.map(b => {
        let contentKey: string;
        if (b.type === 'code') {
            contentKey = b.source;
        } else if (b.type === 'mermaid') {
            contentKey = b.source;
        } else {
            contentKey = b.content;
        }

        const key = `${b.type}:${contentKey}`;
        const count = occurrenceMap.get(key) || 0;
        occurrenceMap.set(key, count + 1);

        const id = generateBlockId(b.type, contentKey, count);

        // Reconstruct to satisfy TS
        if (b.type === 'code') {
            return { type: 'code', language: b.language, source: b.source, id };
        } else if (b.type === 'mermaid') {
            return { type: 'mermaid', source: b.source, id };
        } else {
            return { type: 'text', content: b.content, id };
        }
    });
}
