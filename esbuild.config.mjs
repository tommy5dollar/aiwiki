import { build } from 'esbuild';
import { execSync } from 'child_process';
import { rmSync } from 'fs';

// Clean previous output
rmSync('dist', { recursive: true, force: true });

const sharedOptions = {
  bundle: true,
  platform: 'node',
  target: 'es2022',
  format: 'esm',
  // Provide a real require() for CJS dependencies (e.g. commander) that
  // call require('node:events') and other Node built-ins.
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
};

await build({
  ...sharedOptions,
  entryPoints: ['src/cli.ts'],
  outfile: 'dist/cli.js',
});

await build({
  ...sharedOptions,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
});

// Generate .d.ts declaration files
execSync('tsc --emitDeclarationOnly --declaration --outDir dist', {
  stdio: 'inherit',
});
