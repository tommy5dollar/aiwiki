import { describe, expect, it } from 'vitest';
import {
  _buildCodexArgs,
  _parseJsonOutput,
  _validateCatalog,
} from './codex-page-generator.js';
import type { _CatalogPage, _CodexCatalog } from './codex-page-generator.js';
import type { Config } from '../config.js';

function createConfig(overrides: Partial<Config> = {}): Config {
  return {
    openaiApiKey: 'test-key',
    mermaidValidationCommand: 'mmdc',
    model: 'gpt-5-mini',
    reasoningEffort: 'high',
    outputDir: 'docs',
    projectName: 'test-project',
    repoRoot: '/tmp/test-repo',
    excludedDirs: ['node_modules', '.git'],
    excludedExtensions: ['.png', '.jpg'],
    timeoutMs: 120000,
    concurrency: 2,
    pageTimeout: 30000,
    traceId: 'aiwiki-test-1234',
    ...overrides,
  };
}

describe('_buildCodexArgs', () => {
  it('includes required flags', () => {
    const config = createConfig();
    const args = _buildCodexArgs(config, '/tmp/output.json');

    expect(args).toContain('exec');
    expect(args).toContain('--model');
    expect(args).toContain('gpt-5-mini');
    expect(args).toContain('--full-auto');
    expect(args).toContain('-o');
    expect(args).toContain('/tmp/output.json');
    expect(args).toContain('-C');
    expect(args).toContain('/tmp/test-repo');
  });

  it('includes reasoning effort config', () => {
    const config = createConfig({ reasoningEffort: 'medium' });
    const args = _buildCodexArgs(config, '/tmp/output.json');

    expect(args.some(a => a.includes('model_reasoning_effort') && a.includes('medium'))).toBe(true);
  });
});

describe('_parseJsonOutput', () => {
  it('parses clean JSON', () => {
    const raw = '{"foo": "bar", "n": 42}';
    const result = _parseJsonOutput<{ foo: string; n: number }>(raw, 'test');
    expect(result.foo).toBe('bar');
    expect(result.n).toBe(42);
  });

  it('extracts JSON from surrounding text', () => {
    const raw = 'Some preamble text\n{"key": "value"}\nSome trailing text';
    const result = _parseJsonOutput<{ key: string }>(raw, 'test');
    expect(result.key).toBe('value');
  });

  it('throws when no JSON object found', () => {
    expect(() => _parseJsonOutput('no json here', 'test')).toThrow('No JSON object found');
  });

  it('throws on malformed JSON', () => {
    expect(() => _parseJsonOutput('{broken json: [}', 'test')).toThrow();
  });

  it('handles nested objects', () => {
    const raw = '{"outer": {"inner": [1, 2, 3]}}';
    const result = _parseJsonOutput<{ outer: { inner: number[] } }>(raw, 'test');
    expect(result.outer.inner).toEqual([1, 2, 3]);
  });

  it('handles special characters in string values', () => {
    const raw = '{"content": "line 1\\nline 2\\ttabbed"}';
    const result = _parseJsonOutput<{ content: string }>(raw, 'test');
    expect(result.content).toBe('line 1\nline 2\ttabbed');
  });
});

describe('_validateCatalog', () => {
  function makePage(overrides: Partial<_CatalogPage> = {}): _CatalogPage {
    return {
      slug: 'test-page',
      title: 'Test Page',
      description: 'A test page',
      importance: 'medium',
      relevant_files: ['src/index.ts'],
      ...overrides,
    };
  }

  function makeCatalog(pages: _CatalogPage[]): _CodexCatalog {
    return { title: 'Test Wiki', description: 'A test wiki', pages };
  }

  it('accepts a valid catalog', () => {
    const catalog = makeCatalog([makePage({ slug: 'page-a' }), makePage({ slug: 'page-b' })]);
    expect(() => _validateCatalog(catalog)).not.toThrow();
  });

  it('throws when pages array is empty', () => {
    expect(() => _validateCatalog(makeCatalog([]))).toThrow('no pages');
  });

  it('throws when pages is not an array', () => {
    expect(() => _validateCatalog({ title: 'T', description: 'D', pages: null as unknown as _CatalogPage[] }))
      .toThrow('no pages');
  });

  it('throws on duplicate slugs', () => {
    const catalog = makeCatalog([makePage({ slug: 'dup' }), makeCatalog([makePage({ slug: 'dup' })]).pages[0]]);
    expect(() => _validateCatalog(catalog)).toThrow('Duplicate slug');
  });

  it('throws when required fields are missing', () => {
    const bad = makePage({ title: '' });
    expect(() => _validateCatalog(makeCatalog([bad]))).toThrow('missing required fields');
  });

  it('allows empty relevant_files with a warning', () => {
    const page = makePage({ relevant_files: [] });
    const catalog = makeCatalog([page]);
    expect(() => _validateCatalog(catalog)).not.toThrow();
    expect(page.relevant_files).toEqual([]);
  });
});
