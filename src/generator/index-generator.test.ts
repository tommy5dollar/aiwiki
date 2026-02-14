import { describe, it, expect } from 'vitest';
import { generateIndex } from './index-generator.js';
import type { WikiStructure } from '../types.js';

describe('generateIndex', () => {
  const structure: WikiStructure = {
    title: 'Test Wiki',
    description: 'A test project',
    pages: [
      { slug: 'low-page', title: 'Low Page', description: 'Low priority', importance: 'low', relevant_files: [], related_pages: [] },
      { slug: 'high-page', title: 'High Page', description: 'High priority', importance: 'high', relevant_files: [], related_pages: [] },
      { slug: 'med-page', title: 'Med Page', description: 'Medium priority', importance: 'medium', relevant_files: [], related_pages: [] },
    ],
  };

  it('includes the wiki title as H1', () => {
    const md = generateIndex(structure);
    expect(md).toContain('# Test Wiki');
  });

  it('includes the description', () => {
    const md = generateIndex(structure);
    expect(md).toContain('A test project');
  });

  it('renders a markdown table', () => {
    const md = generateIndex(structure);
    expect(md).toContain('| Page | Description | Priority |');
    expect(md).toContain('|------|-------------|----------|');
  });

  it('links pages with correct slug.md format', () => {
    const md = generateIndex(structure);
    expect(md).toContain('[High Page](high-page.md)');
    expect(md).toContain('[Med Page](med-page.md)');
    expect(md).toContain('[Low Page](low-page.md)');
  });

  it('sorts pages by importance: high → medium → low', () => {
    const md = generateIndex(structure);
    const highIdx = md.indexOf('High Page');
    const medIdx = md.indexOf('Med Page');
    const lowIdx = md.indexOf('Low Page');
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('includes priority badges', () => {
    const md = generateIndex(structure);
    expect(md).toContain('🔴 high');
    expect(md).toContain('🟡 medium');
    expect(md).toContain('🟢 low');
  });

  it('includes the generator attribution', () => {
    const md = generateIndex(structure);
    expect(md).toContain('Generated automatically by aiwiki');
  });
});
