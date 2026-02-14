import type { WikiStructure } from '../types.js';

export function generateIndex(structure: WikiStructure): string {
  const { title, description, pages } = structure;

  const importanceBadges: Record<string, string> = {
    high: '🔴',
    medium: '🟡',
    low: '🟢',
  };

  const sorted = [...pages].sort((a, b) => {
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const aImp = order[a.importance] ?? 1;
    const bImp = order[b.importance] ?? 1;
    if (aImp !== bImp) return aImp - bImp;
    return a.title.localeCompare(b.title);
  });

  let md = `# ${title}\n\n`;
  md += `${description}\n\n`;
  md += `---\n\n`;
  md += `## All Pages\n\n`;
  md += `| Page | Description | Priority |\n`;
  md += `|------|-------------|----------|\n`;

  for (const page of sorted) {
    const badge = importanceBadges[page.importance] || '🟡';
    md += `| [${page.title}](${page.slug}.md) | ${page.description} | ${badge} ${page.importance} |\n`;
  }

  md += `\n---\n\n`;
  md += `_Generated automatically by aiwiki_\n`;

  return md;
}
