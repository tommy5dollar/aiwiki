# aiwiki

Generate Markdown documentation wikis from any codebase using OpenAI Codex CLI agents. Two-phase approach: first plans a catalog of pages, then generates each page with a dedicated agent that explores the repo.

## Installation

```bash
npm install -g aiwiki
```

### Prerequisites

- Node.js >= 18
- [OpenAI Codex CLI](https://github.com/openai/codex) installed globally (`npm install -g @openai/codex`)
- `OPENAI_API_KEY` environment variable set

## CLI Usage

```bash
docs-gen --repo-root /path/to/repo --model gpt-5-mini --reasoning-effort low
```

### Options

| Flag | Env Var | Default | Description |
|------|---------|---------|-------------|
| `--repo-root <path>` | `DOCS_GEN_REPO_ROOT` | `process.cwd()` | Repository root directory |
| `--project-name <name>` | `DOCS_GEN_PROJECT_NAME` | basename of repo root | Project name used in prompts |
| `--output-dir <dir>` | `DOCS_GEN_OUTPUT_DIR` | `docs-{model}-{effort}` | Output directory (relative to repo root) |
| `--model <model>` | `DOCS_GEN_MODEL` | `gpt-5-mini` | Codex model to use |
| `--reasoning-effort <level>` | `DOCS_GEN_REASONING_EFFORT` | `high` | Reasoning effort: low, medium, high |
| `--concurrency <n>` | `DOCS_GEN_CONCURRENCY` | `3` | Number of concurrent codex agents |
| `--page-timeout <ms>` | `DOCS_GEN_PAGE_TIMEOUT` | `300000` | Per-page generation timeout (ms) |
| `--timeout <ms>` | `DOCS_GEN_TIMEOUT` | `1200000` | Overall timeout (ms) |
| `--excluded-dirs <dirs>` | `DOCS_GEN_EXCLUDED_DIRS` | `node_modules,.git,dist,...` | Comma-separated directories to exclude |
| `--log-level <level>` | `DOCS_GEN_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

### Configuration Priority

CLI flags > environment variables > `.docs-gen.json` in repo root > defaults

### `.docs-gen.json` Example

Place in the root of the repo being documented:

```json
{
  "projectName": "my-project",
  "model": "gpt-5-mini",
  "reasoningEffort": "low",
  "excludedDirs": "node_modules,.git,dist,coverage"
}
```

## Programmatic API

```typescript
import {
  loadConfig,
  generateCodexWiki,
  generateIndex,
  validateOutput,
  reportValidation,
  writeOutput,
} from 'aiwiki';
import type { Config, WikiStructure, GeneratedPage } from 'aiwiki';

const config = loadConfig();
const { structure, pages } = await generateCodexWiki(config);
const indexContent = generateIndex(structure);
const issues = validateOutput(structure, indexContent, pages);
reportValidation(issues);
writeOutput(config, indexContent, pages);
```

## Output

Generates a directory containing:
- `index.md` — table of contents with priority badges
- `{slug}.md` — one page per wiki topic

## Validation

The tool automatically:
- Fixes Mermaid node labels with special characters (`()`, `{}`, `|`)
- Validates Mermaid diagram syntax
- Checks minimum page length and heading structure
- Verifies link integrity between index and pages
- Detects orphaned pages

## Development

```bash
npm install
npm run build    # Compile TypeScript
npm test         # Run tests
npm run lint     # ESLint
```
