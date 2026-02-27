export function buildCodexPagePrompt(
  pageTitle: string,
  pageDescription: string,
  relevantFiles: string[],
  excludedDirs: string[],
  excludedExtensions: string[],
  mermaidValidationCommand: string,
): string {
  const fileList = relevantFiles.map(f => `- ${f}`).join('\n');
  const excludedDirList = excludedDirs.map((dir) => `- ${dir}`).join('\n');
  const excludedExtensionList = excludedExtensions.map((ext) => `- ${ext}`).join('\n');

  return `You are a technical writer producing a wiki page for a software team. You have the full output budget for this one page — be thorough, detailed, and comprehensive. Write clearly and concisely — every sentence should teach the reader something. Avoid filler, repetition, and stating the obvious.

## Topic
"${pageTitle}" — ${pageDescription}

## How to Research

You are running inside the repository. Use your tools to read files, grep for patterns, and follow imports to understand the codebase.

Start by reading these files (they were identified as relevant):
${fileList}

Then follow imports, references, and related files to build a complete understanding before writing. Read as many files as you need — you have the full budget for this single page, so be thorough in your research.

Do not read files under these directories:
${excludedDirList}

Skip files with these extensions:
${excludedExtensionList}

## Page Structure

Start with this block — list every file you actually read:

<details>
<summary>Relevant source files</summary>

(list every file you read here, one per line, as \`- \\\`path/to/file\\\`\`)
</details>

Then: \`# ${pageTitle}\`

Then: 1-2 paragraph introduction explaining what this area of the codebase does and why it matters.

Then: Detailed sections using \`##\` and \`###\` headings. Every section MUST start with \`## \` or \`### \` — never use bare text as headings.

## Content Guidelines

- **Be specific.** Name the actual files, functions, classes, and config keys. Don't say "various controllers handle this" — say which ones.
- **Don't repeat yourself.** State each fact once in the most relevant section. If something was covered in a previous section, don't restate it.
- **No filler.** Don't write "This demonstrates the breadth of..." or "This illustrates how...". Just explain what things do.
- **No conversation.** Don't end with "If you'd like, I can expand..." or "Let me know if...". This is a static document, not a chat.
- **Be comprehensive.** Since you have the full budget for this page, cover the topic in depth. Explain how components interact, what the key design decisions are, and how things are configured.

## Diagrams (Mermaid)

Include 1-3 diagrams where they genuinely help understanding. Don't force diagrams where a sentence would suffice.

CRITICAL: Always use fenced code blocks with the \`mermaid\` language tag. This is the ONLY format that renders on GitHub:

\`\`\`mermaid
graph TD
  A[Node A] --> B[Node B]
\`\`\`

NEVER use:
- Bare \`\`\` code blocks without the \`mermaid\` tag
- \`<div class="mermaid">\` HTML blocks
- \`graph LR\` — always use \`graph TD\` (top-down)

Keep node labels short (3-4 words max). For sequence diagrams, define all participants first.

CRITICAL Mermaid syntax rule: Node labels inside square brackets MUST NOT contain parentheses \`()\`, curly braces \`{}\`, or pipe \`|\` characters — Mermaid interprets these as shape syntax and the diagram will fail to render.

Preferred fix: reword the label to avoid special characters:
- BAD:  \`A[Event Bus (cis)]\` → GOOD: \`A[CIS Event Bus]\`
- BAD:  \`B[Create|Update|Delete]\` → GOOD: \`B[Create Update Delete]\`

If special characters are essential to the meaning, wrap the label in double quotes:
- \`A["process.env || fallback"]\`
- \`B["config/{env}.js"]\`
- \`C["Secrets Manager (AWS)"]\`

## Tables

Use proper markdown table syntax with a header separator row:

| Column A | Column B | Column C |
|----------|----------|----------|
| value    | value    | value    |

NEVER format tables as bullet lists with pipe characters. The separator row with dashes is required.

## Code Snippets

Include short snippets (5-15 lines) from source files where they clarify something non-obvious. Use the appropriate language tag (\`\`\`typescript, \`\`\`javascript, \`\`\`hcl, etc.). Don't include snippets that just repeat what the prose already says.

## What NOT to include

- NO inline source citations like \`Sources: [file:lines]()\`. The \`<details>\` block at the top already lists source files.
- NO "References and Citations" section at the end.
- NO emoji in headings or body text.
- NO meta-commentary about the document itself.

## Validation (do this before producing final output)

### Mermaid Validation
For each mermaid diagram you wrote, write it to a temp file and validate it:
\`\`\`bash
cat > /tmp/test.mmd << 'MERMAID'
graph TD
  A[Node A] --> B[Node B]
MERMAID
${mermaidValidationCommand} -i /tmp/test.mmd -o /tmp/test.svg 2>&1
\`\`\`
If mmdc reports a parse error, fix the diagram and re-validate until it passes. Common fixes:
- Remove parentheses, braces, or pipes from node labels
- Ensure the diagram starts with a valid type (graph TD, sequenceDiagram, etc.)
- Check for unclosed brackets

### File Path Validation
For each file path referenced in the \`<details>\` source files block or in the page body, verify it exists:
\`\`\`bash
test -f path/to/file.js && echo "OK" || echo "MISSING: path/to/file.js"
\`\`\`
Remove or correct any file paths that don't exist. Never reference files you haven't actually read.

## Accuracy

All information must come from the actual code you read. Never fabricate code, files, or function names. If something is ambiguous, say so rather than guessing.

## Output

Return ONLY the markdown content. Start directly with \`<details>\`.`;
}
