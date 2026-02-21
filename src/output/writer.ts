import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve, sep } from 'path';
import type { Config } from '../config.js';
import type { GeneratedPage } from '../types.js';
import { logger } from '../utils/logger.js';

function ensureOutputDirIsSafe(repoRoot: string, outputDir: string, rawOutputDir: string): void {
  const normalisedRepoRoot = resolve(repoRoot);
  const normalisedOutputDir = resolve(outputDir);

  if (!rawOutputDir.trim() || rawOutputDir.trim() === '.' || rawOutputDir.trim() === '..') {
    throw new Error(`Refusing to use unsafe output directory "${rawOutputDir}"`);
  }

  if (normalisedOutputDir === normalisedRepoRoot) {
    throw new Error(`Refusing to clean repository root: ${normalisedOutputDir}`);
  }

  const repoRootWithSep = `${normalisedRepoRoot}${sep}`;
  if (!normalisedOutputDir.startsWith(repoRootWithSep)) {
    throw new Error(`Refusing to write outside repository root: ${normalisedOutputDir}`);
  }
}

function resolvePageOutputPath(outputDir: string, slug: string): string {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Invalid page slug "${slug}". Slugs must be kebab-case.`);
  }

  const resolvedPath = resolve(outputDir, `${slug}.md`);
  const outputDirWithSep = `${resolve(outputDir)}${sep}`;
  if (!resolvedPath.startsWith(outputDirWithSep)) {
    throw new Error(`Refusing to write page outside output directory: ${slug}`);
  }

  return resolvedPath;
}

export function writeOutput(
  config: Config,
  indexContent: string,
  pages: GeneratedPage[],
): void {
  const outputDir = resolve(config.repoRoot, config.outputDir);
  ensureOutputDirIsSafe(config.repoRoot, outputDir, config.outputDir);

  // Clean output directory
  if (existsSync(outputDir) && !lstatSync(outputDir).isDirectory()) {
    throw new Error(`Output path exists as a file, not a directory: ${outputDir}`);
  }
  mkdirSync(outputDir, { recursive: true });
  const entries = readdirSync(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(outputDir, entry.name);
    if (entry.isDirectory()) {
      rmSync(entryPath, { recursive: true, force: true });
    } else {
      unlinkSync(entryPath);
    }
  }

  // Write index
  writeFileSync(join(outputDir, 'index.md'), indexContent, 'utf-8');
  logger.info(`Wrote index.md`);

  // Write pages
  for (const page of pages) {
    const pageOutputPath = resolvePageOutputPath(outputDir, page.slug);
    writeFileSync(pageOutputPath, page.content, 'utf-8');
    logger.info(`Wrote ${page.slug}.md`);
  }

  logger.info(`Output: ${pages.length + 1} files written to ${config.outputDir}/`);
}
