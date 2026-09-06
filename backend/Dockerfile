# syntax=docker/dockerfile:1

# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

# Native dependencies may need compilation during install.
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package.json yarn.lock ./

# Install all dependencies (including dev for build)
RUN --mount=type=cache,id=splice-backend-yarn-node24,target=/yarn-cache,sharing=locked \
    YARN_CACHE_FOLDER=/yarn-cache yarn install --frozen-lockfile --non-interactive --network-timeout 300000

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:24-alpine AS production

WORKDIR /app

RUN apk add --no-cache libstdc++ && \
    apk add --no-cache --virtual .build-deps python3 make g++

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN --mount=type=cache,id=splice-backend-yarn-node24,target=/yarn-cache,sharing=locked \
    YARN_CACHE_FOLDER=/yarn-cache yarn install --frozen-lockfile --production --non-interactive --network-timeout 300000 && \
    apk del .build-deps

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# The API remains on 3000. The opt-in MCP listener uses 3001.
EXPOSE 3000 3001

# Start the application. Run migrations explicitly as a separate deploy step.
ENTRYPOINT ["./docker-entrypoint.sh"]
