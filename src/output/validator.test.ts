import { describe, it, expect } from 'vitest';
import { validateOutput } from './validator.js';
import type { WikiStructure } from '../types.js';
import type { GeneratedPage } from '../types.js';

const structure: WikiStructure = {
  title: 'Test',
  description: 'Test wiki',
  pages: [
    { slug: 'page-a', title: 'Page A', description: '', importance: 'high', relevant_files: [], related_pages: [] },
    { slug: 'page-b', title: 'Page B', description: '', importance: 'medium', relevant_files: [], related_pages: [] },
  ],
};

const validPage = (slug: string): GeneratedPage => ({
  slug,
  content: `<details><summary>Relevant source files</summary>
- [src/foo.ts](src/foo.ts)
</details>

# ${slug}

## Overview

This is a detailed section about the feature with plenty of content to exceed the minimum length threshold for validation. It includes multiple paragraphs of real content that describe the architecture and implementation details.

## Implementation

More detail here about how things work internally.

Sources: [src/foo.ts:1-50]()

## Configuration

Configuration details and options.

Sources: [src/bar.ts:10-20]()

Sources: [src/baz.ts:1-5]()
`,
});

const indexContent = `# Test

| Page | Description | Priority |
|------|-------------|----------|
| [Page A](page-a.md) | Desc | high |
| [Page B](page-b.md) | Desc | medium |
`;

describe('validateOutput', () => {
  it('passes with valid pages', () => {
    const pages = [validPage('page-a'), validPage('page-b')];
    const issues = validateOutput(structure, indexContent, pages);
    const errors = issues.filter(i => i.level === 'error');
    expect(errors).toHaveLength(0);
  });

  it('detects empty/stub pages', () => {
    const pages = [
      { slug: 'page-a', content: 'Too short' },
      validPage('page-b'),
    ];
    const issues = validateOutput(structure, indexContent, pages);
    expect(issues.some(i => i.page === 'page-a' && i.message.includes('too short'))).toBe(true);
  });

  it('detects pages missing H2 sections', () => {
    const pages = [
      { slug: 'page-a', content: 'A'.repeat(600) + '\nSources: [a.ts:1]()\nSources: [b.ts:1]()' },
      validPage('page-b'),
    ];
    const issues = validateOutput(structure, indexContent, pages);
    expect(issues.some(i => i.page === 'page-a' && i.message.includes('H2'))).toBe(true);
  });

  it('accepts an H2 heading at the start of content', () => {
    const pages = [
      {
        slug: 'page-a',
        content: `## Start Heading\n\n${'A'.repeat(600)}\n\nSources: [a.ts:1]()\nSources: [b.ts:1]()`,
      },
      validPage('page-b'),
    ];
    const issues = validateOutput(structure, indexContent, pages);
    expect(issues.some(i => i.page === 'page-a' && i.message.includes('H2'))).toBe(false);
  });

  it('detects broken links in index', () => {
    const badIndex = indexContent + '| [Ghost](ghost-page.md) | Missing | low |\n';
    const pages = [validPage('page-a'), validPage('page-b')];
    const issues = validateOutput(structure, badIndex, pages);
    expect(issues.some(i => i.page === 'index' && i.message.includes('ghost-page.md'))).toBe(true);
  });

  it('detects orphaned pages', () => {
    const pages = [validPage('page-a'), validPage('page-b'), validPage('page-c')];
    const issues = validateOutput(structure, indexContent, pages);
    expect(issues.some(i => i.page === 'page-c' && i.message.includes('orphaned'))).toBe(true);
  });

  it('auto-fixes node labels with parentheses', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[Secrets Manager (AWS)]\n```\n';
    const pages = [page, validPage('page-b')];
    const issues = validateOutput(structure, indexContent, pages);
    expect(page.content).toContain('B["Secrets Manager (AWS)"]');
    expect(issues.some(i => i.level === 'error' && i.message.includes('auto-fix needed'))).toBe(true);
  });

  it('auto-fixes node labels with pipes', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[process.env || emGetSecret]\n```\n';
    const pages = [page, validPage('page-b')];
    validateOutput(structure, indexContent, pages);
    expect(page.content).toContain('B["process.env || emGetSecret"]');
  });

  it('auto-fixes node labels with curly braces', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[config/{env}.js files]\n```\n';
    const pages = [page, validPage('page-b')];
    validateOutput(structure, indexContent, pages);
    expect(page.content).toContain('B["config/{env}.js files"]');
  });

  it('does not double-quote already quoted labels', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B["already (quoted)"]\n```\n';
    const pages = [page, validPage('page-b')];
    validateOutput(structure, indexContent, pages);
    expect(page.content).toContain('B["already (quoted)"]');
    expect(page.content).not.toContain('[""');
  });

  it('does not touch labels outside mermaid blocks', () => {
    const page = validPage('page-a');
    page.content += '\nSome text with [link (parens)](url)\n';
    const original = page.content;
    validateOutput(structure, indexContent, [page, validPage('page-b')]);
    expect(page.content).toBe(original);
  });

  it('preserves dollar values in mermaid labels', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[cost ($1)]\n```\n';
    validateOutput(structure, indexContent, [page, validPage('page-b')]);
    expect(page.content).toContain('B["cost ($1)"]');
  });

  it('auto-fixes node labels with nested square brackets', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[returns process.env[key]]\n```\n';
    const pages = [page, validPage('page-b')];
    const issues = validateOutput(structure, indexContent, pages);
    expect(page.content).toContain('B["returns process.env[key]"]');
    expect(issues.some(i => i.level === 'error' && i.message.includes('auto-fix needed'))).toBe(true);
  });

  it('auto-fixes node labels with multiple nested bracket pairs', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[a[b] and [c]]\n```\n';
    validateOutput(structure, indexContent, [page, validPage('page-b')]);
    expect(page.content).toContain('B["a[b] and [c]"]');
  });

  it('auto-fixes node labels with a leading forward slash', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[/api/notion/title]\n```\n';
    validateOutput(structure, indexContent, [page, validPage('page-b')]);
    expect(page.content).toContain('B["/api/notion/title"]');
  });

  it('auto-fixes node labels with a backslash', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[C:\\\\path\\\\to\\\\file]\n```\n';
    validateOutput(structure, indexContent, [page, validPage('page-b')]);
    expect(page.content).toContain('["');
  });

  it('auto-fixes node labels with a mid-label slash', () => {
    const page = validPage('page-a');
    page.content += '\n```mermaid\ngraph TD\n  A[Start] --> B[read/write access]\n```\n';
    validateOutput(structure, indexContent, [page, validPage('page-b')]);
    expect(page.content).toContain('B["read/write access"]');
  });
});
