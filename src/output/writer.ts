import { mkdirSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import type { Config } from '../config.js';
import type { GeneratedPage } from '../types.js';
import { logger } from '../utils/logger.js';

export function writeOutput(
  config: Config,
  indexContent: string,
  pages: GeneratedPage[],
): void {
  const outputDir = resolve(config.repoRoot, config.outputDir);

  // Clean output directory
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
    writeFileSync(join(outputDir, `${page.slug}.md`), page.content, 'utf-8');
    logger.info(`Wrote ${page.slug}.md`);
  }

  logger.info(`Output: ${pages.length + 1} files written to ${config.outputDir}/`);
}
