import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveDefaultMermaidValidationCommand } from './config.js';

describe('resolveDefaultMermaidValidationCommand', () => {
  const createdDirs: string[] = [];

  function createTempDir(): string {
    const path = mkdtempSync(join(tmpdir(), 'aiwiki-mmdc-test-'));
    createdDirs.push(path);
    return path;
  }

  function makeMmdc(dir: string): string {
    const binDir = join(dir, 'node_modules', '.bin');
    mkdirSync(binDir, { recursive: true });
    const mmdcPath = join(binDir, 'mmdc');
    writeFileSync(mmdcPath, '#!/bin/bash\necho mmdc', 'utf-8');
    chmodSync(mmdcPath, 0o755);
    return mmdcPath;
  }

  function makePuppeteerConfig(dir: string): string {
    const configPath = join(dir, 'puppeteer-config.json');
    writeFileSync(configPath, JSON.stringify({ args: ['--no-sandbox'] }), 'utf-8');
    return configPath;
  }

  function cleanTmpArtifacts() {
    try { rmSync(join(tmpdir(), 'mmdc-validate.sh'), { force: true }); } catch { /* ignore */ }
    try { rmSync(join(tmpdir(), 'puppeteer-config.json'), { force: true }); } catch { /* ignore */ }
  }

  beforeEach(() => {
    cleanTmpArtifacts();
  });

  afterEach(() => {
    cleanTmpArtifacts();

    while (createdDirs.length > 0) {
      const path = createdDirs.pop();
      if (path) rmSync(path, { recursive: true, force: true });
    }
  });

  it('returns npx fallback when neither mmdc nor puppeteer config is found', () => {
    const emptyDir = createTempDir();
    const result = resolveDefaultMermaidValidationCommand(emptyDir);
    expect(result).toBe('npx --no-install @mermaid-js/mermaid-cli');
  });

  it('finds mmdc in node_modules/.bin relative to startDir', () => {
    const dir = createTempDir();
    const mmdcPath = makeMmdc(dir);
    const result = resolveDefaultMermaidValidationCommand(dir);
    expect(result).toBe(mmdcPath);
  });

  it('walks up parent directories to find mmdc', () => {
    const parentDir = createTempDir();
    const mmdcPath = makeMmdc(parentDir);
    const childDir = join(parentDir, 'packages', 'child');
    mkdirSync(childDir, { recursive: true });

    const result = resolveDefaultMermaidValidationCommand(childDir);
    // The walk must find the mmdc in the parent. Whether a wrapper is produced
    // depends on whether a puppeteer-config.json is present in the environment
    // (e.g. /tmp/puppeteer-config.json from a prior run). In either case the
    // result must reference the discovered mmdc path.
    const resultReferencesExpectedMmdc =
      result === mmdcPath || readFileSync(result, 'utf-8').includes(mmdcPath);
    expect(resultReferencesExpectedMmdc).toBe(true);
  });

  it('creates a wrapper script when puppeteer config is found', () => {
    const dir = createTempDir();
    makePuppeteerConfig(dir);

    const result = resolveDefaultMermaidValidationCommand(dir);
    expect(result).toContain('mmdc-validate.sh');
  });

  it('wrapper script is executable', () => {
    const dir = createTempDir();
    makePuppeteerConfig(dir);

    const wrapperPath = resolveDefaultMermaidValidationCommand(dir);
    const stat = statSync(wrapperPath);
    // Check owner execute bit
    expect(stat.mode & 0o100).toBeTruthy();
  });

  it('wrapper script uses found mmdc path when both mmdc and puppeteer config exist', () => {
    const dir = createTempDir();
    const mmdcPath = makeMmdc(dir);
    makePuppeteerConfig(dir);

    const wrapperPath = resolveDefaultMermaidValidationCommand(dir);
    const contents = readFileSync(wrapperPath, 'utf-8');
    expect(contents).toContain(mmdcPath);
  });

  it('wrapper script uses npx fallback when only puppeteer config is found', () => {
    const dir = createTempDir();
    makePuppeteerConfig(dir);

    const wrapperPath = resolveDefaultMermaidValidationCommand(dir);
    const contents = readFileSync(wrapperPath, 'utf-8');
    expect(contents).toContain('npx --no-install @mermaid-js/mermaid-cli');
  });
});
