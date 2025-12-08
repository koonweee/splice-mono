# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install all dependencies (including dev for build)
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN yarn build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Copy package files
COPY package.json yarn.lock ./

# Install only production dependencies
RUN yarn install --frozen-lockfile --production && \
    yarn cache clean

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Copy entrypoint script
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Run migrations then start the application
ENTRYPOINT ["./docker-entrypoint.sh"]
