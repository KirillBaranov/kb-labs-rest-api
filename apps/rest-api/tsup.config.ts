import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';
import { readFileSync } from 'node:fs';

// Read package.json at build time
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: ['src/index.ts'],
  outDir: 'dist',
  // Inject version at build time to avoid runtime require('../../package.json')
  define: {
    '__REST_API_VERSION__': JSON.stringify(pkg.version),
  },
});

