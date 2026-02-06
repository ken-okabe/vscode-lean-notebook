import * as vscode from 'vscode';

export type LeanLexBlock =
  | { type: 'code'; source: string; range: { startLine: number; endLine: number } }
  | { type: 'module-doc'; content: string; range: { startLine: number; endLine: number } }
  | { type: 'doc-comment'; content: string; range: { startLine: number; endLine: number } }
  | { type: 'mermaid'; source: string; range: { startLine: number; endLine: number } };

/**
 * Lexically split a Lean file into:
 * - code
 * - module docs (/-! ... -/)
 * - doc comments (/-- ... -/)
 *
 * This is NOT elaboration/compilation. It is a purely textual scan with enough
 * awareness to ignore `-/` inside inline code / fenced code blocks.
 */
export function splitLeanDocComments(text: string, document?: vscode.TextDocument): LeanLexBlock[] {
  const blocks: LeanLexBlock[] = [];

  let pos = 0;
  let last = 0;

  while (pos < text.length) {
    const nextModule = text.indexOf('/-!', pos);
    const nextDoc = text.indexOf('/--', pos);

    let start = -1;
    let kind: 'module-doc' | 'doc-comment' | null = null;

    if (nextModule !== -1 && (nextDoc === -1 || nextModule < nextDoc)) {
      start = nextModule;
      kind = 'module-doc';
    } else if (nextDoc !== -1) {
      start = nextDoc;
      kind = 'doc-comment';
    }

    if (start === -1) break;

    // code before comment
    if (start > last) {
      pushCode(text.slice(last, start));
    }

    const contentStart = start + 3; // /-! or /--
    const end = findDocCommentEnd(text, contentStart);
    if (end === -1) {
      // malformed, treat rest as code
      pushCode(text.slice(start));
      last = text.length;
      break;
    }

    const rawContent = text.slice(contentStart, end);
    pushComment(kind!, rawContent, start, end);

    pos = end + 2; // after -/
    last = pos;
  }

  if (last < text.length) {
    pushCode(text.slice(last));
  }

  // drop empty blocks
  return blocks.filter(b => {
    if (b.type === 'code') return b.source.trim().length > 0;
    if (b.type === 'mermaid') return b.source.trim().length > 0;
    return b.content.trim().length > 0;
  });

  function pushCode(code: string) {
    const lines = code.split('\n');
    let s = 0;
    while (s < lines.length && lines[s].trim() === '') s++;

    if (!document) {
      // best-effort line ranges
      // We start from `last`, but we trimmed `s` lines.
      const rawStartLine = text.slice(0, last).split('\n').length - 1;
      const startLine = rawStartLine + s;

      const trimmedCode = trimEmptyLines(code); // effectively lines.slice(s, ...)
      const trimmedLineCount = trimmedCode.split('\n').length;
      // endLine should be inclusive of the trimmed content
      const endLine = startLine + (trimmedLineCount > 0 ? trimmedLineCount - 1 : 0);

      blocks.push({ type: 'code', source: trimmedCode, range: { startLine, endLine } });
      return;
    }

    const startPos = document.positionAt(last);
    // endPos is for whole range, but we want the range of the preserved code
    // Actually using original endPos is fine for "end boundary", but startPos MUST be correct for relative indexing.

    const startLine = startPos.line + s;
    const endPos = document.positionAt(last + code.length);

    // We can keep endLine as the original block end, or tighten it.
    // Keeping endLine loose is safer for catching diagnostics that might be on trailing whitespace.
    // But logically the "Code Block" ends where code ends.
    // Let's use the original endPos.line for simplicity, as it's just an upper bound filter.

    blocks.push({
      type: 'code',
      source: trimEmptyLines(code),
      range: { startLine: startLine, endLine: endPos.line },
    });
  }

  function pushComment(kind: 'module-doc' | 'doc-comment', content: string, startOffset: number, endOffset: number) {
    if (!document) {
      const startLine = text.slice(0, startOffset).split('\n').length - 1;
      const endLine = startLine + (content.split('\n').length - 1);
      blocks.push({ type: kind, content: content.trim(), range: { startLine, endLine } } as any);
      return;
    }
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset + 2);
    blocks.push({ type: kind, content: content.trim(), range: { startLine: startPos.line, endLine: endPos.line } } as any);
  }
}

function trimEmptyLines(code: string): string {
  const lines = code.split('\n');
  let s = 0;
  while (s < lines.length && lines[s].trim() === '') s++;
  let e = lines.length - 1;
  while (e >= 0 && lines[e].trim() === '') e--;
  if (s > e) return '';
  return lines.slice(s, e + 1).join('\n');
}

/**
 * Split a markdown comment into sub-blocks, extracting mermaid code blocks.
 * Returns an array of { type, content/source } objects.
 */
type SubBlock =
  | { type: 'text'; content: string }
  | { type: 'mermaid'; source: string };

function splitMermaidBlocks(content: string): SubBlock[] {
  const result: SubBlock[] = [];
  // Match fenced code blocks: ```mermaid\n...code...\n```
  const codeBlockRegex = /^```mermaid\s*\n([\s\S]*?)^```\s*$/gm;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Text before this mermaid block
    const textContent = content.substring(lastIndex, match.index);
    if (textContent.trim().length > 0) {
      result.push({ type: 'text', content: textContent.trim() });
    }

    // The mermaid block itself
    const mermaidSource = match[1];
    if (mermaidSource.trim().length > 0) {
      result.push({ type: 'mermaid', source: trimEmptyLines(mermaidSource) });
    }

    lastIndex = codeBlockRegex.lastIndex;
  }

  // Remaining text after last mermaid block
  if (lastIndex < content.length) {
    const remaining = content.substring(lastIndex);
    if (remaining.trim().length > 0) {
      result.push({ type: 'text', content: remaining.trim() });
    }
  }

  // If no mermaid blocks found, return original content
  if (result.length === 0 && content.trim().length > 0) {
    result.push({ type: 'text', content: content.trim() });
  }

  return result;
}

/**
 * Expand a comment block into multiple blocks if it contains mermaid diagrams.
 */
export function expandCommentBlock(block: LeanLexBlock): LeanLexBlock[] {
  if (block.type !== 'module-doc' && block.type !== 'doc-comment') {
    return [block];
  }

  const subBlocks = splitMermaidBlocks(block.content);

  // If only one text block, return original
  if (subBlocks.length === 1 && subBlocks[0].type === 'text') {
    return [block];
  }

  // Otherwise, expand into multiple blocks
  const result: LeanLexBlock[] = [];
  for (const sub of subBlocks) {
    if (sub.type === 'text') {
      result.push({
        type: block.type,
        content: sub.content,
        range: block.range // Use same range (approximate)
      });
    } else {
      result.push({
        type: 'mermaid',
        source: sub.source,
        range: block.range // Use same range (approximate)
      });
    }
  }

  return result;
}

/**
 * Find the end of a doc comment at `startPos` (position right after /-! or /--).
 * We ignore `-/` inside inline code (`...`) and fenced code blocks (``` ... ```).
 */
function findDocCommentEnd(text: string, startPos: number): number {
  let pos = startPos;

  // Markdown inline code spans can be delimited by 1+ backticks.
  // We track the delimiter length and only close when we see the same length again.
  let inlineTickCount: number | null = null;

  // Fenced code blocks are delimited by 3+ backticks typically at start-of-line (optionally indented).
  let inFence = false;

  while (pos < text.length) {
    const ch = text[pos];

    // Handle backtick runs.
    if (ch === '`') {
      let run = 1;
      while (pos + run < text.length && text[pos + run] === '`') run++;

      if (inlineTickCount === null) {
        // Potentially open/close a fence, but only when not inside inline code.
        if (run >= 3) {
          // Determine if we're at start-of-line (after optional spaces/tabs).
          let i = pos - 1;
          while (i >= 0 && text[i] !== '\n') i--;
          const lineStart = i + 1;
          const prefix = text.slice(lineStart, pos);
          const isLineStartish = /^\s*$/.test(prefix);

          if (isLineStartish) {
            inFence = !inFence;
            pos += run;
            continue;
          }
        }

        // Inline code open/close is only meaningful outside fences.
        if (!inFence) {
          inlineTickCount = run;
          pos += run;
          continue;
        }
      } else {
        // We are inside inline code (outside fences by construction).
        if (run === inlineTickCount) {
          inlineTickCount = null;
          pos += run;
          continue;
        }
        // Different-length run inside inline code is literal.
      }

      // Fallthrough: treat as literal backticks.
      pos += run;
      continue;
    }

    const next = pos + 1 < text.length ? text[pos + 1] : '';

    // End of doc comment (Lean)
    if (!inFence && inlineTickCount === null && ch === '-' && next === '/') {
      return pos;
    }

    pos += 1;
  }

  return -1;
}
