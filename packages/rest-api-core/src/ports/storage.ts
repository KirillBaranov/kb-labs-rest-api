/**
 * @module @kb-labs/rest-api-core/ports/storage
 * StoragePort interface for artifact storage
 */

/**
 * Storage Port interface
 * Provides abstraction for reading/writing artifacts
 */
export interface StoragePort {
  /**
   * Read text file from storage
   * @param path - Relative path to file (e.g., 'jobs/{jobId}/log.ndjson')
   * @returns File content as string
   */
  readText(path: string): Promise<string>;

  /**
   * Write text file to storage
   * @param path - Relative path to file
   * @param content - File content
   */
  writeText(path: string, content: string): Promise<void>;

  /**
   * Read JSON file from storage
   * @param path - Relative path to file
   * @returns Parsed JSON object
   */
  readJson<T = unknown>(path: string): Promise<T>;

  /**
   * Write JSON file to storage
   * @param path - Relative path to file
   * @param data - Data to serialize as JSON
   */
  writeJson(path: string, data: unknown): Promise<void>;

  /**
   * Check if file exists
   * @param path - Relative path to file
   * @returns True if file exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * List files in directory
   * @param path - Relative path to directory
   * @returns Array of file paths
   */
  list(path: string): Promise<string[]>;

  /**
   * Delete file or directory
   * @param path - Relative path to file/directory
   */
  delete(path: string): Promise<void>;
}

