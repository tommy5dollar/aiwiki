import type { GeneratedPage, WikiStructure } from '../types.js';
import { logger } from '../utils/logger.js';

export interface ValidationIssue {
  page: string;
  level: 'error' | 'warning';
  message: string;
}

const MIN_PAGE_LENGTH = 500;

/**
 * Validates generated docs, auto-fixes what it can, and returns remaining issues.
 * Errors are serious problems; warnings are worth reviewing.
 * Pages are mutated in-place when auto-fixes are applied.
 */
export function validateOutput(
  structure: WikiStructure,
  indexContent: string,
  pages: GeneratedPage[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const page of pages) {
    page.content = fixMermaidLabels(page.content, page.slug, issues);
    issues.push(...validateMermaid(page));
    issues.push(...validatePageContent(page));
  }

  issues.push(...validateLinks(indexContent, pages));
  issues.push(...validateOrphans(indexContent, pages));

  return issues;
}

/**
 * Auto-fix Mermaid node labels that contain special characters.
 * Wraps unquoted labels containing (){}| in double quotes, which is
 * valid Mermaid syntax: A["label with (parens)"]
 * Runs before validation so the validator sees clean diagrams.
 */
function fixMermaidLabels(
  content: string,
  slug: string,
  issues: ValidationIssue[],
): string {
  return content.replace(
    /```mermaid\s*\n([\s\S]*?)```/g,
    (fullMatch, block: string) => {
      // Match unquoted node labels: ID[label] but not ID["label"]
      const fixed = block.replace(
        /(\w+)\[([^\]"]+)\]/g,
        (_m: string, id: string, label: string) => {
          if (/[(){}|]/.test(label)) {
            issues.push({
              page: slug,
              level: 'warning',
              message: `Mermaid auto-fix: quoted node label "${label.slice(0, 40)}"`,
            });
            return `${id}["${label}"]`;
          }
          return _m;
        },
      );
      return fullMatch.replace(block, () => fixed);
    },
  );
}

/** Check that mermaid code blocks have valid-looking syntax */
function validateMermaid(page: GeneratedPage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const mermaidRegex = /```mermaid\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = mermaidRegex.exec(page.content)) !== null) {
    const block = match[1];
    const blockNum = page.content.slice(0, match.index).split('```mermaid').length;

    // Must start with a valid diagram type
    const firstLine = block.trim().split('\n')[0].trim();
    const validStarts = [
      'graph ', 'flowchart ', 'sequenceDiagram', 'classDiagram',
      'erDiagram', 'stateDiagram', 'gantt', 'pie', 'gitgraph',
      'journey', 'mindmap', 'timeline', 'block-beta',
    ];
    if (!validStarts.some(s => firstLine.startsWith(s))) {
      issues.push({
        page: page.slug,
        level: 'error',
        message: `Mermaid block #${blockNum}: invalid diagram type "${firstLine.slice(0, 40)}"`,
      });
    }

    // Check for unclosed brackets/parens
    const opens = (block.match(/[[({]/g) || []).length;
    const closes = (block.match(/[\])}]/g) || []).length;
    if (opens !== closes) {
      issues.push({
        page: page.slug,
        level: 'error',
        message: `Mermaid block #${blockNum}: mismatched brackets (${opens} open, ${closes} close)`,
      });
    }

    // Check for graph LR (should be TD per our prompt)
    if (/graph\s+LR/i.test(block)) {
      issues.push({
        page: page.slug,
        level: 'warning',
        message: `Mermaid block #${blockNum}: uses "graph LR" instead of "graph TD"`,
      });
    }

    // Check for unquoted special characters that survived the auto-fix
    const nodeLabels = block.matchAll(/\w+\[([^\]"]+)\]/g);
    for (const labelMatch of nodeLabels) {
      const label = labelMatch[1];
      if (/[(){}|]/.test(label)) {
        issues.push({
          page: page.slug,
          level: 'error',
          message: `Mermaid block #${blockNum}: node label "${label.slice(0, 40)}" contains special characters that break Mermaid parsing`,
        });
        break;
      }
    }
  }

  return issues;
}

/** Check that pages aren't empty stubs */
function validatePageContent(page: GeneratedPage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (page.content.length < MIN_PAGE_LENGTH) {
    issues.push({
      page: page.slug,
      level: 'error',
      message: `Page too short (${page.content.length} chars, minimum ${MIN_PAGE_LENGTH})`,
    });
  }

  // Check for at least one H2 section
  if (!/(^|\n)##\s+/.test(page.content)) {
    issues.push({
      page: page.slug,
      level: 'warning',
      message: 'No H2 (##) sections found',
    });
  }

  return issues;
}

/** Check that all links in index.md point to existing page files */
function validateLinks(indexContent: string, pages: GeneratedPage[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const pageSlugs = new Set(pages.map(p => p.slug));

  // Match markdown links like [Title](slug.md)
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(indexContent)) !== null) {
    const target = match[2].replace('.md', '');
    if (target !== 'index' && !pageSlugs.has(target)) {
      issues.push({
        page: 'index',
        level: 'error',
        message: `Broken link: "${match[1]}" points to "${match[2]}" which doesn't exist`,
      });
    }
  }

  return issues;
}

/** Check that all generated pages are referenced in the index */
function validateOrphans(indexContent: string, pages: GeneratedPage[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const page of pages) {
    if (!indexContent.includes(`${page.slug}.md`)) {
      issues.push({
        page: page.slug,
        level: 'warning',
        message: 'Page not referenced in index.md (orphaned)',
      });
    }
  }

  return issues;
}

/** Log all issues and return whether there are any errors */
export function reportValidation(issues: ValidationIssue[]): boolean {
  if (issues.length === 0) {
    logger.info('Validation: all checks passed');
    return true;
  }

  const errors = issues.filter(i => i.level === 'error');
  const warnings = issues.filter(i => i.level === 'warning');

  if (warnings.length > 0) {
    logger.warn(`Validation: ${warnings.length} warning(s)`);
    for (const w of warnings) {
      logger.warn(`  [${w.page}] ${w.message}`);
    }
  }

  if (errors.length > 0) {
    logger.error(`Validation: ${errors.length} error(s)`);
    for (const e of errors) {
      logger.error(`  [${e.page}] ${e.message}`);
    }
  }

  return errors.length === 0;
}
