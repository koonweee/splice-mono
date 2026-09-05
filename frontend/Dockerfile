# syntax=docker/dockerfile:1

# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN --mount=type=cache,id=splice-frontend-yarn-node22,target=/yarn-cache,sharing=locked \
    YARN_CACHE_FOLDER=/yarn-cache yarn install --frozen-lockfile --non-interactive --network-timeout 300000

# API configuration only affects the application build, not dependencies.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# Copy source and build
COPY . .
RUN yarn build

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV SPLICE_INTERNAL_API_BASE_URL=http://splice-backend:3000

# Copy built output from Nitro
COPY --from=builder /app/.output ./.output

EXPOSE 4000

ENV PORT=4000

CMD ["node", ".output/server/index.mjs"]
