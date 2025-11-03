# Multi-stage build for KB Labs REST API
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Set working directory
WORKDIR /app

# Copy package files (for dependency resolution)
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/rest-api-core/package.json ./packages/rest-api-core/
COPY apps/rest-api/package.json ./apps/rest-api/

# Install pnpm
RUN npm install -g pnpm@latest

# Install dependencies
# Note: For link: dependencies to work, they must be available at build time
# In production, use published packages instead of link: dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/rest-api-core/src ./packages/rest-api-core/src
COPY packages/rest-api-core/tsconfig.json ./packages/rest-api-core/tsconfig.json
COPY packages/rest-api-core/tsup.config.ts ./packages/rest-api-core/tsup.config.ts
COPY apps/rest-api/src ./apps/rest-api/src
COPY apps/rest-api/tsconfig.json ./apps/rest-api/tsconfig.json
COPY apps/rest-api/tsup.config.ts ./apps/rest-api/tsup.config.ts

# Build the application
RUN pnpm --filter @kb-labs/rest-api-core build
RUN pnpm --filter @kb-labs/rest-api-app build

# Production stage
FROM node:20-alpine AS runner

# Install minimal dependencies for production
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

# Set working directory
WORKDIR /app

# Copy package files for production install
COPY --chown=nodejs:nodejs pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=nodejs:nodejs package.json ./
COPY --chown=nodejs:nodejs packages/rest-api-core/package.json ./packages/rest-api-core/
COPY --chown=nodejs:nodejs apps/rest-api/package.json ./apps/rest-api/

# Install pnpm (keep it for runtime, may be needed for dynamic installs)
RUN npm install -g pnpm@latest

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile --no-optional

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/packages/rest-api-core/dist ./packages/rest-api-core/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/rest-api/dist ./apps/rest-api/dist

# Copy production node_modules from builder
# Copy only necessary runtime dependencies
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=nodejs:nodejs /app/packages/rest-api-core/node_modules ./packages/rest-api-core/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/apps/rest-api/node_modules ./apps/rest-api/node_modules
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.modules.yaml ./node_modules/.modules.yaml

# Create volume for storage
RUN mkdir -p /app/.kb/rest && chown -R nodejs:nodejs /app/.kb

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/api/v1/health/live || exit 1

# Start the application
CMD ["node", "apps/rest-api/dist/index.js"]

