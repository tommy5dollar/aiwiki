import { describe, expect, it } from 'vitest';
import { buildCodexCatalogPrompt } from './codex-catalog.prompt.js';
import { buildCodexPagePrompt } from './codex-page.prompt.js';

describe('codex prompts', () => {
  const excludedDirs = ['node_modules', '.git', 'docs-output'];
  const excludedExtensions = ['.png', '.jpg'];

  it('includes excluded directories/extensions in catalog prompt', () => {
    const prompt = buildCodexCatalogPrompt('my-project', excludedDirs, excludedExtensions);

    expect(prompt).toContain('Never read files from these excluded directories');
    expect(prompt).toContain('- node_modules');
    expect(prompt).toContain('- .git');
    expect(prompt).toContain('Avoid binary/static files with these extensions');
    expect(prompt).toContain('- .png');
  });

  it('includes excluded directories/extensions in page prompt', () => {
    const prompt = buildCodexPagePrompt(
      'Architecture',
      'How the system fits together',
      ['src/index.ts'],
      excludedDirs,
      excludedExtensions,
      'npx --no-install @mermaid-js/mermaid-cli',
    );

    expect(prompt).toContain('Do not read files under these directories');
    expect(prompt).toContain('- docs-output');
    expect(prompt).toContain('Skip files with these extensions');
    expect(prompt).toContain('- .jpg');
    expect(prompt).toContain('npx --no-install @mermaid-js/mermaid-cli -i /tmp/test.mmd -o /tmp/test.svg 2>&1');
  });
});
