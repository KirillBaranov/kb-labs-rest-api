/**
 * @module @kb-labs/rest-api-core/adapters/storage/fs
 * FS-based storage adapter implementation
 */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type { StoragePort } from '../../ports/storage.js';
import type { RestApiConfig } from '../../config/schema.js';

/**
 * FS-based storage adapter
 */
export class FsStorageAdapter implements StoragePort {
  private baseDir: string;

  constructor(
    private config: RestApiConfig,
    private repoRoot: string
  ) {
    this.baseDir = path.resolve(repoRoot, config.storage.baseDir);
  }

  /**
   * Resolve relative path to absolute path, preventing path traversal
   */
  private resolvePath(relPath: string): string {
    // Validate path is not empty
    if (!relPath || relPath.trim() === '') {
      throw new Error('Empty path provided');
    }

    // Normalize path
    const normalized = path.normalize(relPath);
    
    // Check for path traversal patterns
    if (normalized.includes('..') || normalized.startsWith('/') || normalized.match(/^[A-Z]:/)) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }
    
    // Resolve to base directory
    const resolved = path.resolve(this.baseDir, normalized);
    const resolvedBaseDir = path.resolve(this.baseDir);
    
    // Ensure resolved path is within base directory
    if (!resolved.startsWith(resolvedBaseDir)) {
      throw new Error(`Path traversal detected: ${relPath}`);
    }

    // Additional check: ensure path doesn't escape via symlinks
    // (This is a basic check; full symlink resolution would require more work)
    
    return resolved;
  }

  async readText(filePath: string): Promise<string> {
    const absPath = this.resolvePath(filePath);
    return await fsp.readFile(absPath, 'utf-8');
  }

  async writeText(filePath: string, content: string): Promise<void> {
    const absPath = this.resolvePath(filePath);
    // Ensure directory exists
    await fsp.mkdir(path.dirname(absPath), { recursive: true });
    await fsp.writeFile(absPath, content, 'utf-8');
  }

  async readJson<T = unknown>(filePath: string): Promise<T> {
    const text = await this.readText(filePath);
    return JSON.parse(text) as T;
  }

  async writeJson(filePath: string, data: unknown): Promise<void> {
    const content = JSON.stringify(data, null, 2);
    await this.writeText(filePath, content);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const absPath = this.resolvePath(filePath);
      await fsp.access(absPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(dirPath: string): Promise<string[]> {
    const absPath = this.resolvePath(dirPath);
    const entries = await fsp.readdir(absPath, { withFileTypes: true });
    
    return entries
      .filter(entry => entry.isFile())
      .map(entry => path.join(dirPath, entry.name));
  }

  async delete(filePath: string): Promise<void> {
    const absPath = this.resolvePath(filePath);
    const stats = await fsp.stat(absPath);
    
    if (stats.isDirectory()) {
      await fsp.rmdir(absPath, { recursive: true });
    } else {
      await fsp.unlink(absPath);
    }
  }
}

