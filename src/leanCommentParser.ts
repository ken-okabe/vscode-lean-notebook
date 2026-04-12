export interface TextDocumentLike {
  positionAt(offset: number): { line: number; character: number };
}

export type LeanLexBlock =
  | { type: 'code'; source: string; range: { startLine: number; endLine: number } }
  | { type: 'module-doc'; content: string; range: { startLine: number; endLine: number } }
  | { type: 'doc-comment'; content: string; range: { startLine: number; endLine: number } }
  | { type: 'mermaid'; source: string; range: { startLine: number; endLine: number } }
  | { type: 'graphviz'; source: string; range: { startLine: number; endLine: number } }
  | { type: 'svg-file'; path: string; range: { startLine: number; endLine: number } };

/**
 * Lexically split a Lean file into:
 * - code
 * - module docs (/-! ... -/)
 * - doc comments (/-- ... -/)
 *
 * This is NOT elaboration/compilation. It is a purely textual scan with enough
 * awareness to ignore `-/` inside inline code / fenced code blocks.
 */
export function splitLeanDocComments(text: string, document?: TextDocumentLike): LeanLexBlock[] {
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
    if (b.type === 'graphviz') return b.source.trim().length > 0;
    if (b.type === 'svg-file') return b.path.trim().length > 0;
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
    const dedentedContent = dedent(content);
    if (!document) {
      const startLine = text.slice(0, startOffset).split('\n').length - 1;
      const endLine = startLine + (content.split('\n').length - 1);
      blocks.push({ type: kind, content: dedentedContent, range: { startLine, endLine } } as any);
      return;
    }
    const startPos = document.positionAt(startOffset);
    const endPos = document.positionAt(endOffset + 2);
    blocks.push({ type: kind, content: dedentedContent, range: { startLine: startPos.line, endLine: endPos.line } } as any);
  }
}

/**
 * Remove common leading indentation from a multi-line string.
 * Ignores empty lines when calculating common indentation.
 */
function dedent(str: string): string {
  const lines = str.split('\n');
  let minIndent = Infinity;

  // Calculate min indent
  // We start from line index 1 because the first line is usually " /-- content",
  // where the indentation is determined by the delimiter, not the block structure.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().length === 0) continue;
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    if (indent < minIndent) minIndent = indent;
  }

  // If only one line or no indented lines found in body, just trim.
  // But we should still respect the first line's content.
  if (minIndent === Infinity) minIndent = 0;

  // Remove indent and trim result
  const dedentedLines = lines.map((line, index) => {
    if (index === 0) return line.trim(); // Always just trim the first line
    if (line.trim().length === 0) return '';
    // Safety check: if minIndent > line length (shouldn't happen with correct calculation), slice(0)
    return line.length >= minIndent ? line.slice(minIndent) : line.trim();
  });

  return dedentedLines.join('\n').trim();
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
 * Split a markdown comment into sub-blocks, extracting diagram code blocks
 * (mermaid and graphviz/dot).
 * Returns an array of { type, content/source } objects.
 */
type SubBlock =
  | { type: 'text'; content: string }
  | { type: 'mermaid'; source: string }
  | { type: 'graphviz'; source: string }
  | { type: 'svg-file'; path: string };

function splitDiagramBlocks(content: string): SubBlock[] {
  const result: SubBlock[] = [];
  // Match fenced code blocks: ```mermaid, ```graphviz, or ```dot
  // Also match @svg directives on their own line
  const codeBlockRegex = /^```(mermaid|graphviz|dot)\s*\n([\s\S]*?)^```\s*$/gm;
  const svgDirectiveRegex = /^@svg\s+(.+)$/gm;

  // Collect all matches with positions
  interface MatchInfo { index: number; end: number; type: string; data: string; }
  const matches: MatchInfo[] = [];

  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const lang = match[1];
    const blockType = lang === 'mermaid' ? 'mermaid' : 'graphviz';
    matches.push({ index: match.index, end: codeBlockRegex.lastIndex, type: blockType, data: match[2] });
  }
  while ((match = svgDirectiveRegex.exec(content)) !== null) {
    matches.push({ index: match.index, end: svgDirectiveRegex.lastIndex, type: 'svg-file', data: match[1].trim() });
  }

  // Sort by position
  matches.sort((a, b) => a.index - b.index);

  let lastIndex = 0;
  for (const m of matches) {
    // Text before this match
    const textContent = content.substring(lastIndex, m.index);
    if (textContent.trim().length > 0) {
      result.push({ type: 'text', content: textContent.trim() });
    }

    if (m.type === 'svg-file') {
      result.push({ type: 'svg-file', path: m.data });
    } else {
      // Diagram block (mermaid or graphviz)
      if (m.data.trim().length > 0) {
        result.push({ type: m.type as 'mermaid' | 'graphviz', source: trimEmptyLines(m.data) });
      }
    }

    lastIndex = m.end;
  }

  // Remaining text after last match
  if (lastIndex < content.length) {
    const remaining = content.substring(lastIndex);
    if (remaining.trim().length > 0) {
      result.push({ type: 'text', content: remaining.trim() });
    }
  }

  // If no special blocks found, return original content
  if (result.length === 0 && content.trim().length > 0) {
    result.push({ type: 'text', content: content.trim() });
  }

  return result;
}

/**
 * Split markdown content into sections based on H1 and H2 headings.
 * Ignores headings inside fenced code blocks.
 */
export function splitMarkdownSections(content: string): string[] {
  const lines = content.split('\n');
  const sections: string[] = [];
  let currentSection: string[] = [];

  let inFence = false;
  let fenceChar = '';

  for (const line of lines) {
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!inFence) {
        inFence = true;
        fenceChar = fenceMatch[2][0];
      } else if (line.trim().startsWith(fenceChar.repeat(3))) {
        inFence = false;
      }
    }

    if (!inFence && /^#{1,2}\s/.test(line)) {
      if (currentSection.length > 0) {
        sections.push(currentSection.join('\n'));
        currentSection = [];
      }
    }
    currentSection.push(line);
  }

  if (currentSection.length > 0) {
    sections.push(currentSection.join('\n'));
  }

  return sections;
}

/**
 * Expand a comment block into multiple blocks if it contains diagram blocks
 * (mermaid or graphviz/dot) or Markdown headings.
 */
export function expandCommentBlock(block: LeanLexBlock): LeanLexBlock[] {
  if (block.type !== 'module-doc' && block.type !== 'doc-comment') {
    return [block];
  }

  const subBlocks = splitDiagramBlocks(block.content);

  // Otherwise, expand into multiple blocks
  const result: LeanLexBlock[] = [];
  for (const sub of subBlocks) {
    if (sub.type === 'text') {
      const sections = splitMarkdownSections(sub.content);
      for (const sec of sections) {
        if (sec.trim().length > 0) {
          result.push({
            type: block.type as any, // 'module-doc' or 'doc-comment'
            content: sec.trim(),
            range: block.range
          });
        }
      }
    } else if (sub.type === 'svg-file') {
      result.push({
        type: 'svg-file',
        path: sub.path,
        range: block.range
      } as LeanLexBlock);
    } else {
      result.push({
        type: sub.type, // 'mermaid' or 'graphviz'
        source: sub.source,
        range: block.range // Use same range (approximate)
      } as LeanLexBlock);
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

/**
 * Parse Lean text into a sequence of lexical blocks, dividing docs and code,
 * and expanding diagrams and markdown sections.
 */
export function parseLean(text: string, document?: TextDocumentLike): LeanLexBlock[] {
  return splitLeanDocComments(text, document).flatMap(b => expandCommentBlock(b));
}
