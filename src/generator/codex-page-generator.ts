import { execFile } from 'child_process';
import { readFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { Config } from '../config.js';
import type { WikiStructure, GeneratedPage } from '../types.js';
import { buildCodexCatalogPrompt } from '../prompts/codex-catalog.prompt.js';
import { buildCodexPagePrompt } from '../prompts/codex-page.prompt.js';
import { logger } from '../utils/logger.js';

function buildCodexArgs(config: Config, outputPath: string): string[] {
  return [
    'exec',
    '--model', config.model,
    '-c', `model_reasoning_effort="${config.reasoningEffort}"`,
    '--full-auto',
    '-C', config.repoRoot,
    '-o', outputPath,
  ];
}

function runCodexExec(
  config: Config,
  prompt: string,
  outputPath: string,
  timeoutMs?: number,
): Promise<string> {
  const timeout = timeoutMs ?? config.timeoutMs;

  return new Promise((resolve, reject) => {
    const args = [...buildCodexArgs(config, outputPath), prompt];

    logger.debug(`Running: codex ${args.join(' ').slice(0, 200)}...`);
    logger.info(`Timeout: ${(timeout / 1000 / 60).toFixed(0)} minutes`);

    execFile('codex', args, {
      timeout,
      maxBuffer: 50 * 1024 * 1024, // 50MB
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      if (stderr) {
        logger.debug(`codex stderr (last 1000 chars): ${stderr.slice(-1000)}`);
      }
      logger.debug(`codex stdout length: ${stdout.length}, error: ${error?.message ?? 'none'}`);

      if (error) {
        logger.error(`codex exec failed: ${stderr || error.message}`);
        reject(new Error(`codex exec failed: ${error.message}`));
        return;
      }

      try {
        const content = readFileSync(outputPath, 'utf-8');
        resolve(content);
      } catch {
        if (stdout.trim()) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`codex exec produced no output file and no stdout. stderr: ${stderr?.slice(-500) ?? '(empty)'}`));
        }
      }
    });
  });
}

// --- Phase 1: Catalog ---

interface CatalogPage {
  slug: string;
  title: string;
  description: string;
  importance: string;
  relevant_files: string[];
}

interface CodexCatalog {
  title: string;
  description: string;
  pages: CatalogPage[];
}

function parseJsonOutput<T>(raw: string, label: string): T {
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`No JSON object found in ${label} output`);
  }

  const jsonStr = raw.slice(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    logger.error(`Failed to parse ${label} JSON (first 500 chars): ${jsonStr.slice(0, 500)}`);
    throw new Error(`Failed to parse ${label} output as JSON: ${e}`);
  }
}

function validateCatalog(catalog: CodexCatalog): void {
  if (!catalog.pages || !Array.isArray(catalog.pages) || catalog.pages.length === 0) {
    throw new Error('Catalog contains no pages');
  }

  // Check for duplicate slugs
  const slugs = new Set<string>();
  for (const page of catalog.pages) {
    if (slugs.has(page.slug)) {
      throw new Error(`Duplicate slug in catalog: "${page.slug}"`);
    }
    slugs.add(page.slug);
  }

  // Validate each page has required fields
  for (const page of catalog.pages) {
    if (!page.slug || !page.title || !page.description) {
      throw new Error(`Page missing required fields: ${JSON.stringify(page)}`);
    }
    if (!page.relevant_files || page.relevant_files.length === 0) {
      logger.warn(`Page "${page.slug}" has no relevant_files — agent will explore freely`);
      page.relevant_files = [];
    }
  }

  logger.info(`Catalog validated: ${catalog.pages.length} pages, ${slugs.size} unique slugs`);
}

async function generateCodexCatalog(config: Config): Promise<CodexCatalog> {
  const prompt = buildCodexCatalogPrompt(config.projectName);
  const tmpDir = join(tmpdir(), 'aiwiki-codex');
  mkdirSync(tmpDir, { recursive: true });
  const outputPath = join(tmpDir, `catalog-${randomUUID().slice(0, 8)}.json`);

  logger.info('Phase 1: Generating catalog via codex...');
  logger.info(`Model: ${config.model}`);

  try {
    const raw = await runCodexExec(config, prompt, outputPath);
    logger.info(`Catalog raw output: ${raw.length} chars`);
    logger.debug(`Catalog raw output (first 500 chars): ${raw.slice(0, 500)}`);

    const catalog = parseJsonOutput<CodexCatalog>(raw, 'catalog');
    validateCatalog(catalog);

    for (const page of catalog.pages) {
      logger.info(`  - ${page.slug}: ${page.title} (${page.importance}, ${page.relevant_files.length} files)`);
    }

    return catalog;
  } finally {
    try { unlinkSync(outputPath); } catch { /* already cleaned or never created */ }
  }
}

// --- Phase 2: Per-page generation ---

async function generateSingleCodexPage(
  config: Config,
  pagePlan: CatalogPage,
): Promise<GeneratedPage> {
  const prompt = buildCodexPagePrompt(pagePlan.title, pagePlan.description, pagePlan.relevant_files);
  const tmpDir = join(tmpdir(), 'aiwiki-codex');
  mkdirSync(tmpDir, { recursive: true });
  const outputPath = join(tmpDir, `page-${pagePlan.slug}-${randomUUID().slice(0, 8)}.md`);

  try {
    const content = await runCodexExec(config, prompt, outputPath, config.pageTimeout);
    return { slug: pagePlan.slug, content };
  } finally {
    try { unlinkSync(outputPath); } catch { /* already cleaned or never created */ }
  }
}

async function generateCodexPages(
  config: Config,
  catalog: CodexCatalog,
): Promise<GeneratedPage[]> {
  const results: GeneratedPage[] = [];
  const concurrency = config.concurrency;
  let succeeded = 0;
  let failed = 0;

  logger.info(`Phase 2: Generating ${catalog.pages.length} pages (concurrency: ${concurrency})...`);

  for (let i = 0; i < catalog.pages.length; i += concurrency) {
    const batch = catalog.pages.slice(i, i + concurrency);
    const batchNum = Math.floor(i / concurrency) + 1;
    const totalBatches = Math.ceil(catalog.pages.length / concurrency);
    logger.info(`Batch ${batchNum}/${totalBatches}: ${batch.map(p => p.slug).join(', ')}`);

    const batchResults = await Promise.allSettled(
      batch.map(page => generateSingleCodexPage(config, page)),
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const page = batch[j];

      if (result.status === 'fulfilled') {
        results.push(result.value);
        succeeded++;
        logger.info(`  OK: ${page.slug} (${result.value.content.length} chars)`);
      } else {
        failed++;
        logger.error(`  FAILED: ${page.slug} — ${result.reason}`);
        results.push({
          slug: page.slug,
          content: `# ${page.title}\n\n[Generation failed — this page could not be produced. Error: ${result.reason}]`,
        });
      }
    }

    logger.info(`Progress: ${Math.min(i + concurrency, catalog.pages.length)}/${catalog.pages.length} pages processed`);
  }

  logger.info(`Page generation complete: ${succeeded} succeeded, ${failed} failed out of ${catalog.pages.length}`);
  return results;
}

// --- Orchestrator ---

export async function generateCodexWiki(
  config: Config,
): Promise<{ structure: WikiStructure; pages: GeneratedPage[] }> {
  logger.info('Starting two-phase codex wiki generation...');
  logger.info(`Model: ${config.model}`);

  // Phase 1: Catalog
  const catalog = await generateCodexCatalog(config);

  // Phase 2: Pages
  const pages = await generateCodexPages(config, catalog);

  const structure: WikiStructure = {
    title: catalog.title,
    description: catalog.description,
    pages: catalog.pages.map(p => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      importance: p.importance as 'high' | 'medium' | 'low',
      relevant_files: p.relevant_files,
      related_pages: [],
    })),
  };

  return { structure, pages };
}
