/**
 * @module @kb-labs/rest-api-core/ports/auth
 * AuthPort interface for authentication and authorization
 */

/**
 * User role
 */
export type UserRole = 'viewer' | 'operator' | 'admin';

/**
 * User context
 */
export interface UserContext {
  userId?: string;
  role: UserRole;
  permissions?: string[];
}

/**
 * Auth Port interface
 * Provides abstraction for authentication and authorization
 */
export interface AuthPort {
  /**
   * Authenticate request (extract user from token/headers)
   * @param request - Request object (Fastify request)
   * @returns User context or null if unauthenticated
   */
  authenticate(request: unknown): Promise<UserContext | null>;

  /**
   * Check if user has permission for action
   * @param user - User context
   * @param action - Action name (e.g., 'audit.run', 'release.run')
   * @param resource - Optional resource identifier
   * @returns True if user has permission
   */
  authorize(user: UserContext, action: string, resource?: unknown): boolean;
}

