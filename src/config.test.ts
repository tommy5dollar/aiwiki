import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalArgv = process.argv;
  const originalEnv = process.env;
  const createdDirs: string[] = [];

  function createTempRepoRoot(): string {
    const path = mkdtempSync(join(tmpdir(), 'aiwiki-config-test-'));
    createdDirs.push(path);
    return path;
  }

  beforeEach(() => {
    process.argv = ['node', 'test'];
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;

    while (createdDirs.length > 0) {
      const path = createdDirs.pop();
      if (path) {
        rmSync(path, { recursive: true, force: true });
      }
    }
  });

  it('parses numeric config values as positive integers', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.DOCS_GEN_REPO_ROOT = createTempRepoRoot();
    process.env.DOCS_GEN_TIMEOUT = '120001';
    process.env.DOCS_GEN_CONCURRENCY = '4';
    process.env.DOCS_GEN_PAGE_TIMEOUT = '12000';

    const config = loadConfig();

    expect(config.timeoutMs).toBe(120001);
    expect(config.concurrency).toBe(4);
    expect(config.pageTimeout).toBe(12000);
  });

  it('throws when timeout is not numeric', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.DOCS_GEN_REPO_ROOT = createTempRepoRoot();
    process.env.DOCS_GEN_TIMEOUT = 'abc';

    expect(() => loadConfig()).toThrow('DOCS_GEN_TIMEOUT must be a positive integer');
  });

  it('throws when concurrency is zero', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.DOCS_GEN_REPO_ROOT = createTempRepoRoot();
    process.env.DOCS_GEN_CONCURRENCY = '0';

    expect(() => loadConfig()).toThrow('DOCS_GEN_CONCURRENCY must be a positive integer');
  });
});
