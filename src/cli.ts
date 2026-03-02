#!/usr/bin/env node

import { execFileSync } from 'child_process';
import { appendFileSync } from 'fs';
import { Command } from 'commander';
import { loadConfig } from './config.js';
import { generateCodexWiki } from './generator/codex-page-generator.js';
import { generateIndex } from './generator/index-generator.js';
import { validateOutput, reportValidation } from './output/validator.js';
import { writeOutput } from './output/writer.js';
import { logger } from './utils/logger.js';

function checkCodexOnPath(): void {
  try {
    execFileSync('codex', ['--version'], { stdio: 'pipe' });
  } catch {
    logger.error('`codex` CLI not found on PATH. Install it: npm install -g @openai/codex');
    process.exit(1);
  }
}

const program = new Command()
  .name('aiwiki')
  .description('Generate Markdown documentation wikis from a codebase using Codex CLI agents')
  .option('--repo-root <path>', 'Repository root directory')
  .option('--project-name <name>', 'Project name used in prompts')
  .option('--output-dir <dir>', 'Output directory (relative to repo root)')
  .option('--model <model>', 'Codex model to use')
  .option('--reasoning-effort <level>', 'Reasoning effort (low/medium/high)')
  .option('--concurrency <n>', 'Number of concurrent codex agents')
  .option('--page-timeout <ms>', 'Per-page generation timeout in ms')
  .option('--timeout <ms>', 'Overall timeout in ms')
  .option('--excluded-dirs <dirs>', 'Comma-separated directories to exclude')
  .option('--log-level <level>', 'Log level (debug/info/warn/error)')
  .action(async (opts) => {
    // Map CLI flags to env vars so loadConfig() picks them up
    if (opts.repoRoot) process.env.DOCS_GEN_REPO_ROOT = opts.repoRoot;
    if (opts.projectName) process.env.DOCS_GEN_PROJECT_NAME = opts.projectName;
    if (opts.outputDir) process.env.DOCS_GEN_OUTPUT_DIR = opts.outputDir;
    if (opts.model) process.env.DOCS_GEN_MODEL = opts.model;
    if (opts.reasoningEffort) process.env.DOCS_GEN_REASONING_EFFORT = opts.reasoningEffort;
    if (opts.concurrency) process.env.DOCS_GEN_CONCURRENCY = opts.concurrency;
    if (opts.pageTimeout) process.env.DOCS_GEN_PAGE_TIMEOUT = opts.pageTimeout;
    if (opts.timeout) process.env.DOCS_GEN_TIMEOUT = opts.timeout;
    if (opts.excludedDirs) process.env.DOCS_GEN_EXCLUDED_DIRS = opts.excludedDirs;
    if (opts.logLevel) process.env.DOCS_GEN_LOG_LEVEL = opts.logLevel;

    checkCodexOnPath();

    const startTime = Date.now();
    logger.info('aiwiki starting...');

    const config = loadConfig();
    logger.info(`Project: ${config.projectName}`);
    logger.info(`Model: ${config.model}`);
    logger.info(`Output: ${config.outputDir}`);

    // Phase 1 + 2: Generate catalog and pages
    const { structure, pages } = await generateCodexWiki(config);

    // Generate index
    const indexContent = generateIndex(structure);

    // Validate
    const issues = validateOutput(structure, indexContent, pages);
    const valid = reportValidation(issues);

    // Write output
    writeOutput(config, indexContent, pages);

    if (!valid) {
      logger.warn('Output written despite validation errors — review the files');
    }

    // Write GitHub Actions outputs when running in CI
    const githubOutput = process.env.GITHUB_OUTPUT;
    if (githubOutput) {
      appendFileSync(githubOutput, `output_dir=${config.outputDir}\n`);
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`Completed in ${elapsed}s`);
  });

program.parseAsync();
