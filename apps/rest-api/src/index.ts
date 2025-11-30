/**
 * @module @kb-labs/rest-api-app
 * REST API application entry point
 */

import { bootstrap } from './bootstrap';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

/**
 * Find monorepo root (with kb-* patterns in pnpm-workspace.yaml)
 */
async function findMonorepoRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  
  // Walk up to find workspace with kb-* patterns
  while (true) {
    try {
      const workspacePath = path.join(dir, 'pnpm-workspace.yaml');
      await fs.access(workspacePath);
      const content = await fs.readFile(workspacePath, 'utf-8');
      if (content.includes('kb-*')) {
        return dir;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  // Fallback to process.cwd()
  return process.cwd();
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const startDir = path.resolve(currentDir, '..', '..', '..');

// Find monorepo root
findMonorepoRoot(startDir).then((repoRoot) => {
  // Start server
  bootstrap(repoRoot).catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}).catch((error) => {
  console.error('Failed to find monorepo root:', error);
  process.exit(1);
});

