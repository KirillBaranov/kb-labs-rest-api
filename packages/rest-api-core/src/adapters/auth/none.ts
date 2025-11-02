/**
 * @module @kb-labs/rest-api-core/adapters/auth/none
 * None auth adapter (no-op implementation)
 */

import type { AuthPort, UserContext, UserRole } from '../../ports/auth.js';
import type { RestApiConfig } from '../../config/schema.js';

/**
 * None auth adapter - returns all users as viewer role
 */
export class NoneAuthAdapter implements AuthPort {
  constructor(private config: RestApiConfig) {}

  async authenticate(request: unknown): Promise<UserContext | null> {
    // In none mode, always return a default user with viewer role
    return {
      role: 'viewer',
      permissions: [],
    };
  }

  authorize(user: UserContext, action: string, resource?: unknown): boolean {
    // In none mode, allow all actions (no restrictions)
    // In production with JWT/API key, implement RBAC here
    return true;
  }

  /**
   * Check if user has specific role
   */
  hasRole(user: UserContext, role: UserRole): boolean {
    const roleHierarchy: Record<UserRole, number> = {
      viewer: 1,
      operator: 2,
      admin: 3,
    };

    return roleHierarchy[user.role] >= roleHierarchy[role];
  }

  /**
   * Get required role for action
   */
  getRequiredRole(action: string): UserRole {
    // Map actions to required roles
    if (action.startsWith('release.run') && !action.includes('dryRun')) {
      return 'admin'; // Release requires admin
    }
    
    if (action.startsWith('audit.run') || action.startsWith('devlink.check') || action.startsWith('release.preview')) {
      return 'operator'; // Write operations require operator
    }
    
    return 'viewer'; // Read operations require viewer
  }
}

