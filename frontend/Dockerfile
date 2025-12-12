# Build stage
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copy source and build
COPY . .
RUN yarn build

# Production stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy built output from Nitro
COPY --from=builder /app/.output ./.output

EXPOSE 4000

ENV PORT=4000

CMD ["node", ".output/server/index.mjs"]

