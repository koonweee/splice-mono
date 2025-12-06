# Splice - NestJS Application

A NestJS application for managing financial accounts and transactions.

## Quick Start

Get up and running in 3 steps:

```bash
# 1. Clone and navigate to the project
git clone <repository-url>
cd splice-rewrite

# 2. Copy environment variables (already configured with defaults)
cp .env.example .env

# 3. Start the development environment
docker-compose up
```

That's it! Your application will be running at `http://localhost:3000` 🚀

## Prerequisites

- [Docker](https://www.docker.com/get-started) installed on your machine
- [Docker Compose](https://docs.docker.com/compose/install/) installed
- (Optional) [Node.js 20+](https://nodejs.org/) and [Yarn](https://yarnpkg.com/) for local development

## Development Setup

### Using Docker (Recommended)

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd splice-rewrite
   ```

2. **Set up environment variables**

   Copy the example environment file and adjust values if needed:

   ```bash
   cp .env.example .env
   ```

3. **Start the development environment**

   This will start both PostgreSQL and the NestJS application:

   ```bash
   docker-compose up
   ```

   Or run in detached mode:

   ```bash
   docker-compose up -d
   ```

4. **Access the application**

   - Application: `http://localhost:3000`
   - API Documentation (Swagger): `http://localhost:3000/api`

### Development Commands

```bash
# Start all services
docker-compose up

# Start in detached mode
docker-compose up -d

# Stop all services
docker-compose down

# Stop and remove volumes (WARNING: This will delete database data)
docker-compose down -v

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f app
docker-compose logs -f postgres

# Rebuild containers (after dependency changes)
docker-compose up --build

# Execute commands in the app container
docker-compose exec app yarn test
docker-compose exec app yarn lint

# Access PostgreSQL database
docker-compose exec postgres psql -U splice_user -d splice_dev
```

### Hot Module Replacement (HMR)

The development environment is configured with automatic reload. Any changes you make to the source code in the `./src` directory will automatically trigger a rebuild and restart of the application.

## Local Development (Without Docker)

If you prefer to run the application locally without Docker:

1. **Install dependencies**

   ```bash
   yarn install
   ```

2. **Set up PostgreSQL**

   Make sure PostgreSQL is running locally and update the `.env` file with your local database credentials.

3. **Start the development server**
   ```bash
   yarn start:dev
   ```

> When updating or installing new dependencies, do `yarn docker:down` then `yarn docker:up:build`

## API Documentation

Swagger/OpenAPI documentation is available at `/api` when the server is running.

### Viewing the API

1. Start the server: `docker-compose up` or `yarn start:dev`
2. Open `http://localhost:3000/api` in your browser
3. The OpenAPI JSON spec is available at `http://localhost:3000/api-json`

### Generating a Typesafe Client

You can generate a fully typed API client from the OpenAPI spec using tools like:

**Using `@hey-api/openapi-ts`:**
```bash
# Install the generator
yarn add -D @hey-api/openapi-ts

# Generate the client (server must be running)
npx @hey-api/openapi-ts -i http://localhost:3000/api-json -o ./src/client
```

**Using `openapi-typescript` (types only):**
```bash
yarn add -D openapi-typescript

# Generate TypeScript types
npx openapi-typescript http://localhost:3000/api-json -o ./src/api-types.ts
```

**Using `orval` (React Query/SWR hooks):**
```bash
yarn add -D orval

# Generate with React Query hooks
npx orval --input http://localhost:3000/api-json --output ./src/api
```

## Testing

```bash
# Run unit tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run tests with coverage
yarn test:cov

# Run e2e tests
yarn test:e2e
```

## Environment Variables

Key environment variables (see `.env.example` for all variables):

- `PORT` - Application port (default: 3000)
- `NODE_ENV` - Environment mode (development/production)
- `APP_DOMAIN` - Application domain for webhooks (e.g., `https://example.com`)
- `POSTGRES_HOST` - PostgreSQL host
- `POSTGRES_PORT` - PostgreSQL port (default: 5432)
- `POSTGRES_DB` - Database name
- `POSTGRES_USER` - Database user
- `POSTGRES_PASSWORD` - Database password

Any environment variables added to .env should also be added to the docker-compose

## Project Structure

```
├── src/                  # Application source code
│   ├── account/         # Account module
│   ├── types/           # TypeScript type definitions
│   ├── dtos/            # Data transfer objects
│   ├── zod-validation/  # Custom validation pipes
│   └── main.ts          # Application entry point
├── test/                # Test files
│   ├── account/         # Account tests
│   └── mocks/           # Test mocks
├── bruno/               # API testing collection
├── docker-compose.yml   # Docker compose configuration
├── Dockerfile.dev       # Development Docker configuration
└── .env                 # Environment variables (not in git)
```

## License

UNLICENSED
