import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Config } from '../config.js';
import { writeOutput } from './writer.js';

function createConfig(repoRoot: string, outputDir: string): Config {
  return {
    openaiApiKey: 'test-key',
    model: 'gpt-5-mini',
    reasoningEffort: 'high',
    outputDir,
    projectName: 'test-project',
    repoRoot,
    excludedDirs: [],
    excludedExtensions: [],
    timeoutMs: 120000,
    concurrency: 2,
    pageTimeout: 30000,
  };
}

describe('writeOutput', () => {
  const tempDirs: string[] = [];

  function createTempRepoRoot(): string {
    const path = mkdtempSync(join(tmpdir(), 'aiwiki-writer-test-'));
    tempDirs.push(path);
    return path;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const path = tempDirs.pop();
      if (path) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  });

  it('refuses to use repo root as output directory', () => {
    const repoRoot = createTempRepoRoot();
    const config = createConfig(repoRoot, '.');

    expect(() => writeOutput(config, '# Index', [{ slug: 'page-one', content: '# Page' }]))
      .toThrow('unsafe output directory');
  });

  it('refuses to write when output path is an existing file', () => {
    const repoRoot = createTempRepoRoot();
    const outputPath = resolve(repoRoot, 'docs');
    writeFileSync(outputPath, 'not a directory', 'utf-8');
    const config = createConfig(repoRoot, 'docs');

    expect(() => writeOutput(config, '# Index', [{ slug: 'page-one', content: '# Page' }]))
      .toThrow('exists as a file');
  });

  it('refuses slug traversal attempts', () => {
    const repoRoot = createTempRepoRoot();
    const config = createConfig(repoRoot, 'docs');

    expect(() => writeOutput(config, '# Index', [{ slug: '../escape', content: '# Page' }]))
      .toThrow('Invalid page slug');
  });

  it('refuses output directories outside repo root', () => {
    const repoRoot = createTempRepoRoot();
    const config = createConfig(repoRoot, '../outside');

    expect(() => writeOutput(config, '# Index', [{ slug: 'page-one', content: '# Page' }]))
      .toThrow('outside repository root');
  });

  it('writes index and page files for valid input', () => {
    const repoRoot = createTempRepoRoot();
    const config = createConfig(repoRoot, 'docs');
    writeOutput(config, '# Index', [{ slug: 'page-one', content: '# Page One' }]);

    const outputDir = resolve(repoRoot, 'docs');
    expect(readFileSync(join(outputDir, 'index.md'), 'utf-8')).toBe('# Index');
    expect(readFileSync(join(outputDir, 'page-one.md'), 'utf-8')).toBe('# Page One');
  });
});
