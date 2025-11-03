/**
 * @module @kb-labs/rest-api-core/utils/cli-validator.test
 * Tests for CLI validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  validateCommand,
  validateAndSanitizeArgs,
  validateWorkingDirectory,
  validateArtifactPath,
  validateEnvVars,
  validateCommandBinary,
} from '../../utils/cli-validator.js';
import path from 'node:path';
import os from 'node:os';

describe('CLI Validator', () => {
  describe('validateCommand', () => {
    it('should allow valid commands', () => {
      expect(() => {
        validateCommand(['audit', 'release'], 'audit');
      }).not.toThrow();
    });

    it('should reject invalid commands', () => {
      expect(() => {
        validateCommand(['audit', 'release'], 'rm');
      }).toThrow('not allowed');
    });
  });

  describe('validateAndSanitizeArgs', () => {
    it('should allow valid arguments', () => {
      const result = validateAndSanitizeArgs(['--json', '--strict', '--scope=packages/*']);
      expect(result).toEqual(['--json', '--strict', '--scope=packages/*']);
    });

    it('should reject dangerous characters', () => {
      expect(() => {
        validateAndSanitizeArgs(['--scope=packages/*; rm -rf /']);
      }).toThrow('Dangerous character');
    });

    it('should reject command injection patterns', () => {
      expect(() => {
        validateAndSanitizeArgs(['--scope=`rm -rf /`']);
      }).toThrow('command injection');
    });

    it('should reject path traversal', () => {
      expect(() => {
        validateAndSanitizeArgs(['--scope=../../../etc/passwd']);
      }).toThrow('Path traversal');
    });
  });

  describe('validateWorkingDirectory', () => {
    const repoRoot = os.tmpdir();

    it('should allow directory within repo root', () => {
      const result = validateWorkingDirectory(
        path.join(repoRoot, 'subdir'),
        repoRoot
      );
      expect(result).toContain(repoRoot);
    });

    it('should reject directory outside repo root', () => {
      expect(() => {
        validateWorkingDirectory('/tmp/outside', repoRoot);
      }).toThrow('outside repository root');
    });
  });

  describe('validateArtifactPath', () => {
    const baseDir = '/app/.kb/rest';

    it('should allow valid artifact paths', () => {
      const result = validateArtifactPath('runs/audit/latest/report.json', baseDir);
      expect(result).toBeTruthy();
    });

    it('should reject path traversal', () => {
      expect(() => {
        validateArtifactPath('../../etc/passwd', baseDir);
      }).toThrow('Path traversal');
    });

    it('should reject absolute paths', () => {
      expect(() => {
        validateArtifactPath('/etc/passwd', baseDir);
      }).toThrow('Path traversal');
    });

    it('should reject empty paths', () => {
      expect(() => {
        validateArtifactPath('', baseDir);
      }).toThrow('Empty');
    });
  });

  describe('validateEnvVars', () => {
    it('should allow valid environment variables', () => {
      const result = validateEnvVars({
        NODE_ENV: 'production',
        CUSTOM_VAR: 'value',
      });
      expect(result).toEqual({
        NODE_ENV: 'production',
        CUSTOM_VAR: 'value',
      });
    });

    it('should reject blocklisted variables', () => {
      expect(() => {
        validateEnvVars({
          PATH: '/usr/bin',
        });
      }).toThrow('Blocklisted');
    });

    it('should reject dangerous characters in values', () => {
      expect(() => {
        validateEnvVars({
          CUSTOM_VAR: 'value; rm -rf /',
        });
      }).toThrow('Dangerous character');
    });
  });

  describe('validateCommandBinary', () => {
    it('should allow valid command binaries', () => {
      expect(() => {
        validateCommandBinary('pnpm');
      }).not.toThrow();

      expect(() => {
        validateCommandBinary('node');
      }).not.toThrow();
    });

    it('should reject path traversal', () => {
      expect(() => {
        validateCommandBinary('../bin/evil');
      }).toThrow('Invalid command binary');
    });

    it('should reject invalid characters', () => {
      expect(() => {
        validateCommandBinary('cmd; rm -rf /');
      }).toThrow('Invalid command binary');
    });
  });
});

