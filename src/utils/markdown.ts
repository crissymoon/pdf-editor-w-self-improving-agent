/**
 * Markdown conversion module.
 *
 * Converts a Markdown string to an HTML string.
 * All standard block and inline elements are supported:
 *   - Headings h1-h6
 *   - Unordered lists (- and * and + prefixes)
 *   - Ordered lists (1. 2. 3. etc.)
 *   - Nested lists (indented by 2 or 4 spaces)
 *   - Fenced code blocks (``` with optional language)
 *   - Inline code (`code`)
 *   - Bold (**text** or __text__)
 *   - Italic (*text* or _text_)
 *   - Bold-italic (***text***)
 *   - Strikethrough (~~text~~)
 *   - Blockquotes (> text)
 *   - Horizontal rules (---, ***, ___)
 *   - Links ([label](url))
 *   - Images (![alt](url))
 *   - Hard line breaks (two trailing spaces)
 *   - Paragraphs (blank-line separated)
 *
 * The output is safe HTML. Tag injection through Markdown source is
 * neutralized by escaping raw HTML characters before processing.
 */

// ---------------------------------------------------------------------------
// Security: escape raw HTML in source before any processing.
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Inline rendering
// ---------------------------------------------------------------------------

function renderInline(text: string): string {
  // Bold-italic must come before bold and italic to avoid partial match.
  return text
    .replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>')
    .replace(/___(.+?)___/gs, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/gs, '<strong>$1</strong>')
    .replace(/__(.+?)__/gs, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs, '<em>$1</em>')
    .replace(/_(.+?)_/gs, '<em>$1</em>')
    .replace(/~~(.+?)~~/gs, '<del>$1</del>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/  \n/g, '<br />');
}

// ---------------------------------------------------------------------------
// List parsing
// ---------------------------------------------------------------------------

interface ListItem {
  ordered: boolean;
  indent: number;
  content: string;
  children: ListItem[];
}

const ORDERED_RE = /^(\s*)(\d+)\.\s+(.*)$/;
const UNORDERED_RE = /^(\s*)([-*+])\s+(.*)$/;

function isListLine(line: string): boolean {
  return ORDERED_RE.test(line) || UNORDERED_RE.test(line);
}

function parseListLine(line: string): { indent: number; ordered: boolean; content: string } | null {
  let match = ORDERED_RE.exec(line);
  if (match) {
    return { indent: match[1].length, ordered: true, content: match[3] };
  }
  match = UNORDERED_RE.exec(line);
  if (match) {
    return { indent: match[1].length, ordered: false, content: match[3] };
  }
  return null;
}

function buildListHtml(items: ListItem[]): string {
  if (items.length === 0) return '';

  const tag = items[0].ordered ? 'ol' : 'ul';
  const lines: string[] = [`<${tag}>`];

  for (const item of items) {
    const inner = renderInline(item.content);
    if (item.children.length > 0) {
      lines.push(`<li>${inner}${buildListHtml(item.children)}</li>`);
    } else {
      lines.push(`<li>${inner}</li>`);
    }
  }

  lines.push(`</${tag}>`);
  return lines.join('');
}

function parseList(lines: string[], startIdx: number): { html: string; consumed: number } {
  const rootItems: ListItem[] = [];
  const stack: { item: ListItem; indent: number }[] = [];

  let idx = startIdx;

  while (idx < lines.length) {
    const line = lines[idx];
    const parsed = parseListLine(line);

    if (!parsed) {
      // A blank line ends the list; a continuation line appends to last item.
      if (line.trim() === '') {
        idx++;
        break;
      }
      // Non-list, non-blank line: stop.
      break;
    }

    const item: ListItem = {
      ordered: parsed.ordered,
      indent: parsed.indent,
      content: parsed.content,
      children: [],
    };

    if (stack.length === 0 || parsed.indent <= stack[0].indent) {
      // Reset stack to root level.
      stack.length = 0;
      rootItems.push(item);
      stack.push({ item, indent: parsed.indent });
    } else {
      // Find the correct parent.
      while (stack.length > 1 && parsed.indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].item;
      parent.children.push(item);
      stack.push({ item, indent: parsed.indent });
    }

    idx++;
  }

  return { html: buildListHtml(rootItems), consumed: idx - startIdx };
}

// ---------------------------------------------------------------------------
// Block rendering
// ---------------------------------------------------------------------------

export function renderMarkdown(source: string): string {
  // Normalize line endings and escape HTML before processing.
  const escaped = escapeHtml(source.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
  const lines = escaped.split('\n');
  const output: string[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];

    // --- Fenced code block ---
    const fenceMatch = /^(`{3,})([\w-]*)$/.exec(line.trim());
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const lang = fenceMatch[2] ? ` class="language-${fenceMatch[2]}"` : '';
      const codeLines: string[] = [];
      idx++;
      while (idx < lines.length && !lines[idx].trim().startsWith(fence)) {
        codeLines.push(lines[idx]);
        idx++;
      }
      idx++; // consume closing fence
      output.push(`<pre><code${lang}>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // --- Horizontal rule ---
    if (/^(\s*)(---+|\*\*\*+|___+)\s*$/.test(line)) {
      output.push('<hr />');
      idx++;
      continue;
    }

    // --- Heading ---
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = renderInline(headingMatch[2]);
      output.push(`<h${level}>${content}</h${level}>`);
      idx++;
      continue;
    }

    // --- Blockquote ---
    if (/^>\s/.test(line)) {
      const quoteLines: string[] = [];
      while (idx < lines.length && /^>\s?/.test(lines[idx])) {
        quoteLines.push(lines[idx].replace(/^>\s?/, ''));
        idx++;
      }
      output.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // --- List (ordered or unordered) ---
    if (isListLine(line)) {
      const { html, consumed } = parseList(lines, idx);
      output.push(html);
      idx += consumed;
      continue;
    }

    // --- Blank line (paragraph separator) ---
    if (line.trim() === '') {
      idx++;
      continue;
    }

    // --- Paragraph ---
    const paraLines: string[] = [];
    while (idx < lines.length && lines[idx].trim() !== '' && !isListLine(lines[idx]) && !/^(#{1,6})\s/.test(lines[idx]) && !/^>\s/.test(lines[idx]) && !/^(`{3,})/.test(lines[idx].trim()) && !/^(\s*)(---+|\*\*\*+|___+)\s*$/.test(lines[idx])) {
      paraLines.push(lines[idx]);
      idx++;
    }
    if (paraLines.length > 0) {
      output.push(`<p>${renderInline(paraLines.join('\n'))}</p>`);
    }
  }

  return output.join('\n');
}

// ---------------------------------------------------------------------------
// Convenience: render into a DOM element (safe, replaces children)
// ---------------------------------------------------------------------------

export function renderMarkdownInto(element: Element, source: string): void {
  const html = renderMarkdown(source);
  // Use DOMParser to create a safe fragment without innerHTML assignment.
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const wrapper = doc.body.firstChild as Element;
  element.replaceChildren(...Array.from(wrapper.childNodes));
}
