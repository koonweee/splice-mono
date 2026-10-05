# syntax=docker/dockerfile:1

# Preserve the currently deployed asset graph for clients using its service worker.
# Advance this digest to the deployed frontend before the next production release.
ARG PREVIOUS_FRONTEND_IMAGE=ghcr.io/koonweee/splice-frontend:d14e797@sha256:25041511ae4b4946e35cd283a1418654b4c294764cbcb81dc0ba180090d859ff
FROM ${PREVIOUS_FRONTEND_IMAGE} AS previous

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
ARG VITE_CACHED_HOME=true
ENV VITE_CACHED_HOME=$VITE_CACHED_HOME

# Copy source and build
COPY . .
# Include the previous asset graph before Nitro creates its static asset index.
COPY --from=previous /app/.output/public /previous-public
RUN mkdir -p public/assets && \
    cp -r /previous-public/assets/. public/assets/ && \
    for asset in /previous-public/pwa-shell-*.html /previous-public/pwa-offline-*.js; do \
      if [ -f "$asset" ]; then cp -n "$asset" public/; fi; \
    done && \
    rm -rf /previous-public && yarn build

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
