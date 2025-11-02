# Multi-stage build for KB Labs REST API
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY package.json ./
COPY packages/rest-api-core/package.json ./packages/rest-api-core/
COPY apps/rest-api/package.json ./apps/rest-api/

# Install pnpm
RUN npm install -g pnpm@latest

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

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

# Install pnpm and production dependencies
RUN npm install -g pnpm@latest && \
    pnpm install --prod --frozen-lockfile && \
    npm uninstall -g pnpm

# Copy built application from builder
COPY --from=builder --chown=nodejs:nodejs /app/packages/rest-api-core/dist ./packages/rest-api-core/dist
COPY --from=builder --chown=nodejs:nodejs /app/apps/rest-api/dist ./apps/rest-api/dist

# Copy core bundle dependencies if needed
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=builder --chown=nodejs:nodejs /app/packages/rest-api-core/node_modules ./packages/rest-api-core/node_modules

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

