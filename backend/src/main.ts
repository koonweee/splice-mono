import { NestFactory } from '@nestjs/core';
import type { OpenAPIObject } from '@nestjs/swagger';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { generateSchemaComponents } from './common/zod-api-response';

/**
 * Transform nullable $ref patterns in OpenAPI spec for better orval compatibility.
 *
 * zod-to-openapi generates: { allOf: [{ $ref: "..." }, { nullable: true }] }
 * orval doesn't handle this well, generating broken intersection types.
 *
 * This transforms it to: { oneOf: [{ $ref: "..." }, { type: "null" }] }
 * which orval correctly generates as: Type | null
 */
function fixNullableRefs(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(fixNullableRefs);
  }

  const record = obj as Record<string, unknown>;

  // Check if this is an allOf with a $ref and nullable: true pattern
  if (
    record.allOf &&
    Array.isArray(record.allOf) &&
    record.allOf.length === 2
  ) {
    const refItem = record.allOf.find(
      (item): item is { $ref: string } =>
        typeof item === 'object' && item !== null && '$ref' in item,
    );
    const nullableItem = record.allOf.find(
      (item): item is { nullable: true } =>
        typeof item === 'object' &&
        item !== null &&
        'nullable' in item &&
        (item as { nullable: unknown }).nullable === true,
    );

    if (refItem && nullableItem) {
      // Transform to oneOf with $ref and null type
      return {
        oneOf: [{ $ref: refItem.$ref }, { type: 'null' }],
      };
    }
  }

  // Recursively process all properties
  const result: Record<string, unknown> = {};
  Object.entries(record).forEach(([key, value]) => {
    result[key] = fixNullableRefs(value);
  });
  return result;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Enable raw body for webhook signature verification
    rawBody: true,
    // Buffer logs during bootstrap so pino captures everything
    bufferLogs: true,
  });

  // Use pino logger globally
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Enable cookie parsing for JWT authentication
  app.use(cookieParser());

  // Enable CORS for frontend
  const corsOrigins: string[] = [
    'http://localhost:5173',
    'http://localhost:4000',
  ];
  if (process.env.FRONTEND_DOMAIN) {
    corsOrigins.push(process.env.FRONTEND_DOMAIN);
  }
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Setup Swagger/OpenAPI 3.1 (required for nullable oneOf with type: "null")
  const baseConfig = new DocumentBuilder()
    .setTitle('Splice API')
    .setDescription('Financial account management API')
    .setVersion('1.0')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  const config = { ...baseConfig, openapi: '3.1.0' };
  let document = SwaggerModule.createDocument(app, config);

  // Merge Zod schema components into the OpenAPI document
  const zodSchemas = generateSchemaComponents();
  document.components = document.components ?? {};
  document.components.schemas = {
    ...document.components.schemas,
    ...(zodSchemas as typeof document.components.schemas),
  };

  // Fix nullable $ref patterns for better orval type generation
  document = fixNullableRefs(document) as OpenAPIObject;

  SwaggerModule.setup('api', app, document, {
    customCss: `
      .auth-status {
        position: absolute;
        top: 12px;
        right: 80px;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 13px;
        font-family: sans-serif;
      }
      .auth-status.logged-in {
        background: #e8f5e9;
        color: #2e7d32;
      }
      .auth-status.logged-out {
        background: #fff3e0;
        color: #e65100;
      }
    `,
    customJsStr: `
      (function() {
        function checkAuth() {
          fetch('/user/me', { credentials: 'include' })
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(user => showStatus(user.email, true))
            .catch(() => showStatus('Not logged in', false));
        }

        function showStatus(text, isLoggedIn) {
          let el = document.querySelector('.auth-status');
          if (!el) {
            el = document.createElement('div');
            el.className = 'auth-status';
            document.querySelector('.topbar')?.appendChild(el);
          }
          el.textContent = isLoggedIn ? '✓ ' + text : text;
          el.className = 'auth-status ' + (isLoggedIn ? 'logged-in' : 'logged-out');
        }

        // Check on load and periodically (in case of login/logout in another tab)
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', checkAuth);
        } else {
          checkAuth();
        }
        setInterval(checkAuth, 30000);
      })();
    `,
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log({ port }, 'Server started');
}
void bootstrap();
