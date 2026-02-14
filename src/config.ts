import { readFileSync } from 'fs';
import { basename, resolve } from 'path';

export interface Config {
  openaiApiKey: string;
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
};

export function loadConfig(): Config {
  const cliArgs = parseCliArgs();

  // Try loading .docs-gen.json from repo root
  let fileConfig: Record<string, unknown> = {};
  const repoRoot = cliArgs['repo-root'] || process.env.DOCS_GEN_REPO_ROOT || process.cwd();
  try {
    const raw = readFileSync(resolve(repoRoot, '.docs-gen.json'), 'utf-8');
    fileConfig = JSON.parse(raw);
  } catch {
    // No config file — that's fine
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
    model,
    reasoningEffort,
    outputDir,
    projectName: get('DOCS_GEN_PROJECT_NAME', 'projectName', basename(repoRoot)),
    repoRoot,
    excludedDirs,
    excludedExtensions: get('DOCS_GEN_EXCLUDED_EXTENSIONS', 'excludedExtensions', '.png,.jpg,.jpeg,.gif,.ico,.svg,.woff,.woff2,.ttf,.eot,.mp3,.mp4,.zip,.tar,.gz,.lock,.map')
      .toString().split(',').map((e: string) => e.trim()).filter(Boolean),
    timeoutMs: Number(get('DOCS_GEN_TIMEOUT', 'timeout', '1200000')), // 20 min default
    concurrency: Number(get('DOCS_GEN_CONCURRENCY', 'concurrency', '3')),
    pageTimeout: Number(get('DOCS_GEN_PAGE_TIMEOUT', 'pageTimeout', '300000')), // 5 min default
  };
}
