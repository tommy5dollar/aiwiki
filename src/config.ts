import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, basename, resolve, join } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

export interface Config {
  openaiApiKey: string;
  mermaidValidationCommand: string;
  model: string;
  reasoningEffort: string;
  outputDir: string;
  projectName: string;
  repoRoot: string;
  excludedDirs: string[];
  excludedExtensions: string[];
  timeoutMs: number;
  concurrency: number;
  pageTimeout: number;
  traceId: string;
}

function parseCliArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--') && i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      const key = arg.slice(2);
      args[key] = argv[++i];
    }
  }
  return args;
}

function parsePositiveInteger(
  rawValue: unknown,
  keyName: string,
): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    throw new Error(`${keyName} must be a positive integer. Received: ${rawValue}`);
  }
  return parsed;
}

function resolveDefaultMermaidValidationCommand(): string {
  let currentDir = dirname(fileURLToPath(import.meta.url));
  let mmdcPath = 'npx --no-install @mermaid-js/mermaid-cli';

  // Find mmdc binary
  while (true) {
    const candidate = resolve(currentDir, 'node_modules/.bin/mmdc');
    if (existsSync(candidate)) {
      mmdcPath = candidate;
      break;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // Find puppeteer config (ships with this package)
  currentDir = dirname(fileURLToPath(import.meta.url));
  let puppeteerConfigPath: string | undefined;

  while (true) {
    const candidate = resolve(currentDir, 'puppeteer-config.json');
    if (existsSync(candidate)) {
      puppeteerConfigPath = candidate;
      break;
    }
    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  if (puppeteerConfigPath) {
    // Write a wrapper script that bakes in the puppeteer config.
    // Codex agents run the mmdc command from the prompt but may omit flags
    // like -p. A wrapper script ensures --no-sandbox is always applied.
    const tmpPath = join(tmpdir(), 'puppeteer-config.json');
    copyFileSync(puppeteerConfigPath, tmpPath);

    const wrapperPath = join(tmpdir(), 'mmdc-validate.sh');
    writeFileSync(wrapperPath, `#!/bin/bash\n${mmdcPath} -p ${tmpPath} "$@"\n`, 'utf-8');
    chmodSync(wrapperPath, 0o755);

    return wrapperPath;
  }

  return mmdcPath;
}

const CLI_TO_CONFIG: Record<string, { envKey: string; fileKey: string }> = {
  'output-dir':        { envKey: 'DOCS_GEN_OUTPUT_DIR', fileKey: 'outputDir' },
  'model':             { envKey: 'DOCS_GEN_MODEL', fileKey: 'model' },
  'reasoning-effort':  { envKey: 'DOCS_GEN_REASONING_EFFORT', fileKey: 'reasoningEffort' },
  'timeout':           { envKey: 'DOCS_GEN_TIMEOUT', fileKey: 'timeout' },
  'concurrency':       { envKey: 'DOCS_GEN_CONCURRENCY', fileKey: 'concurrency' },
  'page-timeout':      { envKey: 'DOCS_GEN_PAGE_TIMEOUT', fileKey: 'pageTimeout' },
  'repo-root':         { envKey: 'DOCS_GEN_REPO_ROOT', fileKey: 'repoRoot' },
  'project-name':      { envKey: 'DOCS_GEN_PROJECT_NAME', fileKey: 'projectName' },
  'excluded-dirs':     { envKey: 'DOCS_GEN_EXCLUDED_DIRS', fileKey: 'excludedDirs' },
  'trace-id':          { envKey: 'DOCS_GEN_TRACE_ID', fileKey: 'traceId' },
};

export function loadConfig(): Config {
  const cliArgs = parseCliArgs();

  // Try loading config from repo root
  let fileConfig: Record<string, unknown> = {};
  const repoRoot = cliArgs['repo-root'] || process.env.DOCS_GEN_REPO_ROOT || process.cwd();
  try {
    const raw = readFileSync(resolve(repoRoot, '.aiwiki.json'), 'utf-8');
    fileConfig = JSON.parse(raw);
  } catch {
    try {
      // Backwards compatibility with older config filename
      const raw = readFileSync(resolve(repoRoot, '.docs-gen.json'), 'utf-8');
      fileConfig = JSON.parse(raw);
    } catch {
      // No config file — that's fine
    }
  }

  function get<T>(envKey: string, fileKey: string, defaultVal: T): T {
    // CLI args take highest priority
    const cliMapping = Object.entries(CLI_TO_CONFIG).find(([, v]) => v.envKey === envKey || v.fileKey === fileKey);
    if (cliMapping) {
      const cliVal = cliArgs[cliMapping[0]];
      if (cliVal !== undefined) return cliVal as unknown as T;
    }
    const envVal = process.env[envKey];
    if (envVal !== undefined) return envVal as unknown as T;
    if (fileKey in fileConfig) return fileConfig[fileKey] as T;
    return defaultVal;
  }

  const openaiApiKey = get('OPENAI_API_KEY', 'openaiApiKey', '');
  if (!openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const model = get('DOCS_GEN_MODEL', 'model', 'gpt-5-mini');
  const reasoningEffort = get('DOCS_GEN_REASONING_EFFORT', 'reasoningEffort', 'high');

  // Auto-generate output dir: docs-{model}-{reasoning}
  const defaultOutputDir = `docs-${model}-${reasoningEffort}`;
  const outputDir = get('DOCS_GEN_OUTPUT_DIR', 'outputDir', defaultOutputDir);

  const excludedDirs = get('DOCS_GEN_EXCLUDED_DIRS', 'excludedDirs', 'node_modules,.git,dist,coverage,.github')
    .toString().split(',').map((d: string) => d.trim()).filter(Boolean);
  // Always exclude the output directory from scanning
  if (!excludedDirs.includes(outputDir)) {
    excludedDirs.push(outputDir);
  }

  return {
    openaiApiKey,
    mermaidValidationCommand: get(
      'DOCS_GEN_MERMAID_VALIDATE_COMMAND',
      'mermaidValidationCommand',
      resolveDefaultMermaidValidationCommand(),
    ),
    model,
    reasoningEffort,
    outputDir,
    projectName: get('DOCS_GEN_PROJECT_NAME', 'projectName', basename(repoRoot)),
    repoRoot,
    excludedDirs,
    excludedExtensions: get('DOCS_GEN_EXCLUDED_EXTENSIONS', 'excludedExtensions', '.png,.jpg,.jpeg,.gif,.ico,.svg,.woff,.woff2,.ttf,.eot,.mp3,.mp4,.zip,.tar,.gz,.lock,.map')
      .toString().split(',').map((e: string) => e.trim()).filter(Boolean),
    timeoutMs: parsePositiveInteger(get('DOCS_GEN_TIMEOUT', 'timeout', '1200000'), 'DOCS_GEN_TIMEOUT'), // 20 min default
    concurrency: parsePositiveInteger(get('DOCS_GEN_CONCURRENCY', 'concurrency', '3'), 'DOCS_GEN_CONCURRENCY'),
    pageTimeout: parsePositiveInteger(get('DOCS_GEN_PAGE_TIMEOUT', 'pageTimeout', '300000'), 'DOCS_GEN_PAGE_TIMEOUT'), // 5 min default
    traceId: get('DOCS_GEN_TRACE_ID', 'traceId', `aiwiki-${randomUUID().slice(0, 8)}`),
  };
}
