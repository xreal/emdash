import { describe, expect, it } from 'vitest';
import { jiraAdfToMarkdown } from './adf';

describe('jiraAdfToMarkdown', () => {
  it('preserves headings, inline marks, links, breaks, quotes, and rules', () => {
    expect(
      jiraAdfToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Release notes' }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Use ', marks: [{ type: 'strong' }] },
              { type: 'text', text: 'care', marks: [{ type: 'em' }, { type: 'strike' }] },
              { type: 'hardBreak' },
              {
                type: 'text',
                text: 'the docs',
                marks: [{ type: 'link', attrs: { href: 'https://example.com/docs?q=one two' } }],
              },
              { type: 'text', text: ' and ' },
              { type: 'text', text: 'x`y', marks: [{ type: 'code' }] },
            ],
          },
          {
            type: 'blockquote',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Check first.' }] }],
          },
          { type: 'rule' },
        ],
      })
    ).toBe(
      '## Release notes\n\n**Use** ~~_care_~~  \n[the docs](<https://example.com/docs?q=one%20two>) and ``x`y``\n\n> Check first.\n\n---'
    );
  });

  it('renders nested ordered, bullet, and task lists', () => {
    expect(
      jiraAdfToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'orderedList',
            attrs: { order: 3 },
            content: [
              {
                type: 'listItem',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
                  {
                    type: 'bulletList',
                    content: [
                      {
                        type: 'listItem',
                        content: [
                          { type: 'paragraph', content: [{ type: 'text', text: 'Child' }] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { state: 'DONE' },
                content: [{ type: 'text', text: 'Shipped' }],
              },
              {
                type: 'taskItem',
                attrs: { state: 'TODO' },
                content: [{ type: 'text', text: 'Document' }],
              },
            ],
          },
        ],
      })
    ).toBe('3. Parent\n   - Child\n\n- [x] Shipped\n- [ ] Document');
  });

  it('renders fenced code, tables, panels, expands, cards, mentions, and emoji', () => {
    expect(
      jiraAdfToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: { language: 'ts' },
            content: [{ type: 'text', text: 'const fence = ```;' }],
          },
          {
            type: 'table',
            content: [
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }],
                  },
                  {
                    type: 'tableHeader',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }],
                  },
                ],
              },
              {
                type: 'tableRow',
                content: [
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A|B' }] }],
                  },
                  {
                    type: 'tableCell',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }],
                  },
                ],
              },
            ],
          },
          {
            type: 'panel',
            attrs: { panelType: 'warning' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be careful' }] }],
          },
          {
            type: 'expand',
            attrs: { title: 'More details' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden context' }] }],
          },
          {
            type: 'paragraph',
            content: [
              { type: 'mention', attrs: { text: '@Ada' } },
              { type: 'text', text: ' ' },
              { type: 'emoji', attrs: { shortName: ':wave:' } },
              { type: 'text', text: ' ' },
              { type: 'inlineCard', attrs: { url: 'https://example.com/card/1' } },
            ],
          },
        ],
      })
    ).toContain('````ts\nconst fence = ```;\n````');
    expect(
      jiraAdfToMarkdown({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
              },
            ],
          },
        ],
      })
    ).toBe('| A |\n| --- |');

    const markdown = jiraAdfToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'panel',
          attrs: { panelType: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Be careful' }] }],
        },
        {
          type: 'expand',
          attrs: { title: 'More details' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hidden context' }] }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { text: '@Ada' } },
            { type: 'text', text: ' ' },
            { type: 'emoji', attrs: { shortName: ':wave:' } },
            { type: 'text', text: ' ' },
            { type: 'inlineCard', attrs: { url: 'https://example.com/card/1' } },
          ],
        },
      ],
    });
    expect(markdown).toContain('> **Warning**\n>\n> Be careful');
    expect(markdown).toContain('**More details**\n\n> Hidden context');
    expect(markdown).toContain(
      '@Ada 👋 [https://example.com/card/1](<https://example.com/card/1>)'
    );
  });

  it('keeps PHP variables literal and replaces common Jira emoji shortcodes', () => {
    expect(
      jiraAdfToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: '$instances, $fnc, $guest = 1 and $register = 3. :check_mark: :custom_team_icon:',
              },
            ],
          },
          {
            type: 'paragraph',
            content: [{ type: 'emoji', attrs: { text: ':warning:', shortName: ':warning:' } }],
          },
        ],
      })
    ).toBe(
      '\\$instances, \\$fnc, \\$guest = 1 and \\$register = 3. ✅ :custom\\_team\\_icon:\n\n⚠️'
    );
  });

  it('keeps unknown and unsupported content readable and neutralizes unsafe input', () => {
    expect(
      jiraAdfToMarkdown({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: '<script>alert(1)</script> [click](javascript:bad)' },
              {
                type: 'text',
                text: ' unsafe link',
                marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
              },
            ],
          },
          { type: 'media', attrs: { type: 'file', filename: 'design[1].png' } },
          {
            type: 'mystery',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kept text' }] }],
          },
          { type: 'emptyMystery' },
          { type: 'blockCard', attrs: { url: 'javascript:alert(1)' } },
        ],
      })
    ).toBe(
      '\\<script\\>alert\\(1\\)\\</script\\> \\[click\\]\\(javascript:bad\\) unsafe link\n\n[Jira attachment: design\\[1\\].png]\n\nKept text\n\n[Unsupported Jira content: emptyMystery]\n\n[Jira card: javascript:alert\\(1\\)]'
    );
  });

  it('returns null for empty or malformed documents', () => {
    expect(jiraAdfToMarkdown({ type: 'doc', content: [] })).toBeNull();
    expect(jiraAdfToMarkdown(null)).toBeNull();
    expect(jiraAdfToMarkdown([])).toBeNull();
    expect(jiraAdfToMarkdown({ type: 'doc', content: 'not an array' })).toBeNull();
    expect(
      jiraAdfToMarkdown({
        type: 'doc',
        content: [
          null,
          { type: 7 },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Still readable', marks: 'not an array' }],
          },
        ],
      })
    ).toBe('Still readable');
  });
});
