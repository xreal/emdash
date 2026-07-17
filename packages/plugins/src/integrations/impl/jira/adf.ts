type AdfMark = {
  type?: string;
  attrs?: Record<string, unknown>;
};

type AdfNode = {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: AdfMark[];
  content?: AdfNode[];
};

const BLOCK_NODE_TYPES = new Set([
  'blockquote',
  'blockCard',
  'bulletList',
  'codeBlock',
  'doc',
  'expand',
  'heading',
  'mediaGroup',
  'mediaSingle',
  'nestedExpand',
  'orderedList',
  'panel',
  'paragraph',
  'rule',
  'table',
  'taskList',
]);

const JIRA_EMOJI_SHORTCODES: Record<string, string> = {
  ':bug:': '🐛',
  ':bulb:': '💡',
  ':check_mark:': '✅',
  ':construction:': '🚧',
  ':cross_mark:': '❌',
  ':eyes:': '👀',
  ':heavy_check_mark:': '✔️',
  ':hourglass:': '⏳',
  ':information_source:': 'ℹ️',
  ':link:': '🔗',
  ':lock:': '🔒',
  ':memo:': '📝',
  ':no_entry:': '⛔',
  ':pushpin:': '📌',
  ':rocket:': '🚀',
  ':sparkles:': '✨',
  ':tada:': '🎉',
  ':thumbsup:': '👍',
  ':unlock:': '🔓',
  ':warning:': '⚠️',
  ':wave:': '👋',
  ':white_check_mark:': '✅',
  ':x:': '❌',
};

/** Convert Jira ADF into safe Markdown before it crosses the plugin boundary. */
export function jiraAdfToMarkdown(value: unknown): string | null {
  if (typeof value === 'string') return renderPlainText(value).trim() || null;
  if (!isAdfNode(value)) return null;
  return renderNode(value).trim() || null;
}

function renderNode(node: AdfNode): string {
  const content = nodeContent(node);

  switch (node.type) {
    case 'doc':
      return renderBlocks(content);
    case 'text':
      return renderText(node);
    case 'paragraph':
      return renderInline(content);
    case 'heading': {
      const level = numberAttribute(node, 'level');
      return `${'#'.repeat(level && level >= 1 && level <= 6 ? level : 1)} ${renderInline(content)}`;
    }
    case 'hardBreak':
      return '  \n';
    case 'rule':
      return '---';
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return renderList(node);
    case 'listItem':
    case 'taskItem':
      return renderListItem(node);
    case 'blockquote':
      return quote(renderBlocks(content));
    case 'codeBlock':
      return renderCodeBlock(node);
    case 'mention':
      return escapeMarkdownText(stringAttribute(node, 'text') ?? '@unknown user');
    case 'emoji':
      return renderPlainText(
        stringAttribute(node, 'text') ?? stringAttribute(node, 'shortName') ?? ':emoji:'
      );
    case 'inlineCard':
    case 'blockCard':
      return renderCard(node);
    case 'table':
      return renderTable(node);
    case 'panel':
      return renderPanel(node);
    case 'expand':
    case 'nestedExpand':
      return renderExpand(node);
    case 'media':
    case 'mediaInline':
    case 'attachment':
      return renderMediaFallback(node);
    case 'mediaGroup':
    case 'mediaSingle':
      return renderBlocks(content) || '[Unsupported Jira media]';
    case 'date':
      return renderDate(node);
    case 'status':
      return escapeMarkdownText(stringAttribute(node, 'text') ?? 'Unknown status');
    default:
      return renderUnknownNode(node);
  }
}

function renderText(node: AdfNode): string {
  const text = node.text ?? '';
  if (!text) return '';

  const marks = nodeMarks(node);
  const hasCodeMark = marks.some((mark) => mark.type === 'code');
  let output = hasCodeMark ? renderInlineCode(text) : renderPlainText(text);

  for (const mark of marks) {
    if (!output || mark.type === 'code') continue;
    if (mark.type === 'strong') output = wrapMarkedText(output, '**');
    if (mark.type === 'em') output = wrapMarkedText(output, '_');
    if (mark.type === 'strike') output = wrapMarkedText(output, '~~');
    if (mark.type === 'link') {
      const href = safeMarkdownUrl(stringMarkAttribute(mark, 'href'));
      if (href) output = `[${output}](<${href}>)`;
    }
  }

  return output;
}

function renderInlineCode(value: string): string {
  const text = value.replace(/\r?\n/g, ' ');
  const longestRun = Math.max(0, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length));
  const delimiter = '`'.repeat(longestRun + 1);
  const needsPadding = /^ | $|^`|`$/.test(text);
  return `${delimiter}${needsPadding ? ' ' : ''}${text}${needsPadding ? ' ' : ''}${delimiter}`;
}

function renderCodeBlock(node: AdfNode): string {
  const code = renderRawText(nodeContent(node)).replace(/\n$/, '');
  const longestRun = Math.max(0, ...Array.from(code.matchAll(/`+/g), (match) => match[0].length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const language = stringAttribute(node, 'language');
  const safeLanguage = language && /^[\w#+.-]+$/.test(language) ? language : '';
  return `${fence}${safeLanguage}\n${code}\n${fence}`;
}

function renderList(node: AdfNode): string {
  const ordered = node.type === 'orderedList';
  const taskList = node.type === 'taskList';
  const start = ordered ? (numberAttribute(node, 'order') ?? 1) : 1;

  return nodeContent(node)
    .map((item, index) => {
      const marker = ordered
        ? `${String(start + index)}.`
        : taskList
          ? `- [${stringAttribute(item, 'state')?.toUpperCase() === 'DONE' ? 'x' : ' '}]`
          : '-';
      const itemContent = renderListItem(item) || '[Unsupported Jira list item]';
      const lines = itemContent.split('\n');
      const indent = ' '.repeat(marker.length + 1);
      return `${marker} ${lines[0]}${lines
        .slice(1)
        .map((line) => `\n${indent}${line}`)
        .join('')}`;
    })
    .join('\n');
}

function renderListItem(node: AdfNode): string {
  return nodeContent(node)
    .map((child) => renderNode(child))
    .filter(Boolean)
    .join('\n');
}

function renderTable(node: AdfNode): string {
  const rows = nodeContent(node).filter((row) => row.type === 'tableRow');
  const cells = rows.map((row) =>
    nodeContent(row)
      .filter((cell) => cell.type === 'tableCell' || cell.type === 'tableHeader')
      .map(renderTableCell)
  );
  const columnCount = Math.max(0, ...cells.map((row) => row.length));
  if (columnCount === 0) return '[Empty Jira table]';

  const firstRowIsHeader = nodeContent(rows[0]).some((cell) => cell.type === 'tableHeader');
  const header = firstRowIsHeader ? cells[0] : Array.from({ length: columnCount }, () => ' ');
  const body = firstRowIsHeader ? cells.slice(1) : cells;
  const markdownRows = [
    tableRow(header, columnCount),
    tableRow(
      Array.from({ length: columnCount }, () => '---'),
      columnCount
    ),
    ...body.map((row) => tableRow(row, columnCount)),
  ];
  return markdownRows.join('\n');
}

function renderTableCell(node: AdfNode): string {
  return renderBlocks(nodeContent(node))
    .replace(/\n+/g, ' ')
    .replace(/(?<!\\)\|/g, '\\|')
    .trim();
}

function tableRow(cells: string[], columnCount: number): string {
  const padded = Array.from({ length: columnCount }, (_, index) => cells[index] ?? '');
  return `| ${padded.join(' | ')} |`;
}

function renderPanel(node: AdfNode): string {
  const panelType = stringAttribute(node, 'panelType') ?? 'info';
  const labels: Record<string, string> = {
    error: 'Error',
    info: 'Info',
    note: 'Note',
    success: 'Success',
    warning: 'Warning',
  };
  const label = labels[panelType] ?? 'Panel';
  const content = renderBlocks(nodeContent(node));
  return quote(`**${label}**${content ? `\n\n${content}` : ''}`);
}

function renderExpand(node: AdfNode): string {
  const title = escapeMarkdownText(stringAttribute(node, 'title') ?? 'Details');
  const content = renderBlocks(nodeContent(node));
  return `**${title}**${content ? `\n\n${quote(content)}` : ''}`;
}

function renderCard(node: AdfNode): string {
  const url = stringAttribute(node, 'url');
  const safeUrl = safeMarkdownUrl(url);
  if (safeUrl) return `[${escapeMarkdownText(url ?? safeUrl)}](<${safeUrl}>)`;
  return url ? `[Jira card: ${escapeMarkdownText(url)}]` : '[Unsupported Jira card]';
}

function renderMediaFallback(node: AdfNode): string {
  const label =
    stringAttribute(node, 'alt') ??
    stringAttribute(node, 'filename') ??
    stringAttribute(node, 'name');
  const kind =
    node.type === 'attachment' || stringAttribute(node, 'type') === 'file' ? 'attachment' : 'media';
  return label ? `[Jira ${kind}: ${escapeMarkdownText(label)}]` : `[Unsupported Jira ${kind}]`;
}

function renderDate(node: AdfNode): string {
  const timestamp = stringAttribute(node, 'timestamp');
  if (!timestamp) return '[Unknown Jira date]';
  const date = new Date(Number(timestamp));
  return Number.isNaN(date.getTime()) ? '[Unknown Jira date]' : date.toISOString().slice(0, 10);
}

function renderUnknownNode(node: AdfNode): string {
  const content = nodeContent(node);
  if (content.length > 0) {
    const hasBlockContent = content.some((child) => BLOCK_NODE_TYPES.has(child.type ?? ''));
    const rendered = hasBlockContent ? renderBlocks(content) : renderInline(content);
    if (rendered) return rendered;
  }
  const type = node.type ? `: ${escapeMarkdownText(node.type)}` : '';
  return `[Unsupported Jira content${type}]`;
}

function renderBlocks(content: AdfNode[]): string {
  return content.map(renderNode).filter(Boolean).join('\n\n');
}

function renderInline(content: AdfNode[]): string {
  return content.map(renderNode).join('');
}

function renderRawText(content: AdfNode[]): string {
  return content
    .map((node) => {
      if (node.type === 'text') return node.text ?? '';
      if (node.type === 'hardBreak') return '\n';
      return renderRawText(nodeContent(node));
    })
    .join('');
}

function quote(value: string): string {
  return value
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

function escapeMarkdownText(value: string): string {
  return value
    .replace(/[\\`*_[\]{}()|<>$]/g, '\\$&')
    .replace(/^(\s{0,3})(#{1,6}|[-+])(?=\s)/gm, '$1\\$2')
    .replace(/^(\s{0,3}\d+)\.(?=\s)/gm, '$1\\.');
}

function renderPlainText(value: string): string {
  const withEmoji = value.replace(/:[a-z0-9_+-]+:/gi, (shortcode) => {
    return JIRA_EMOJI_SHORTCODES[shortcode.toLowerCase()] ?? shortcode;
  });
  return escapeMarkdownText(withEmoji);
}

function wrapMarkedText(value: string, delimiter: string): string {
  const leadingWhitespace = value.match(/^\s*/)?.[0] ?? '';
  const trailingWhitespace = value.match(/\s*$/)?.[0] ?? '';
  const content = value.slice(leadingWhitespace.length, value.length - trailingWhitespace.length);
  return content
    ? `${leadingWhitespace}${delimiter}${content}${delimiter}${trailingWhitespace}`
    : value;
}

function safeMarkdownUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function stringAttribute(node: AdfNode, key: string): string | null {
  const value = node.attrs?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringMarkAttribute(mark: AdfMark, key: string): string | null {
  const value = mark.attrs?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberAttribute(node: AdfNode, key: string): number | null {
  const value = node.attrs?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nodeContent(node: AdfNode | undefined): AdfNode[] {
  return node && Array.isArray(node.content) ? node.content.filter(isAdfNode) : [];
}

function nodeMarks(node: AdfNode): AdfMark[] {
  return Array.isArray(node.marks) ? node.marks.filter(isAdfMark) : [];
}

function isAdfMark(value: unknown): value is AdfMark {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAdfNode(value: unknown): value is AdfNode {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  return (
    (node.type === undefined || typeof node.type === 'string') &&
    (node.text === undefined || typeof node.text === 'string')
  );
}
