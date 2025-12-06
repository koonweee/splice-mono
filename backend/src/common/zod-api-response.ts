import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
  getRefId,
} from '@asteasolutions/zod-to-openapi';
import {
  ApiBody,
  ApiResponse,
  type ApiBodyOptions,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import { z } from 'zod';

// Extend Zod with OpenAPI methods - must be called before any schema definitions
extendZodWithOpenApi(z);

/**
 * Global OpenAPI registry for collecting schema definitions.
 * Schemas registered here will be merged into the NestJS Swagger document.
 */
export const openApiRegistry = new OpenAPIRegistry();

/**
 * Register a Zod schema with a name for OpenAPI spec generation.
 * Uses zod-to-openapi's .openapi() method for proper $ref support.
 *
 * @example
 * export const UserSchema = registerSchema('User', z.object({ ... }));
 */
export function registerSchema<T extends z.ZodType>(
  name: string,
  schema: T,
): T {
  // Use .openapi(refId) to set the reference ID for this schema
  const registeredSchema = schema.openapi(name);
  // Also register in the global registry for component generation
  openApiRegistry.register(name, registeredSchema as z.ZodType);
  return registeredSchema;
}

/**
 * Generate OpenAPI schema components from all registered schemas.
 * Call this after all schemas are loaded to get the components for merging.
 */
export function generateSchemaComponents() {
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);
  const spec = generator.generateComponents();
  return spec.components?.schemas ?? {};
}

/**
 * Get the registered schema name from a Zod schema's OpenAPI metadata.
 */
function getSchemaRefId(schema: z.ZodType): string | undefined {
  return getRefId(schema);
}

/**
 * Convert a Zod schema to a JSON Schema reference or inline schema.
 * If the schema was registered with registerSchema(), returns a $ref.
 */
function schemaToJsonSchema(schema: z.ZodType, isArray = false) {
  const refId = getSchemaRefId(schema);
  const baseSchema = refId
    ? { $ref: `#/components/schemas/${refId}` }
    : { type: 'object' as const }; // Fallback for unregistered schemas

  return isArray ? { type: 'array' as const, items: baseSchema } : baseSchema;
}

/**
 * Options for ZodApiResponse decorator.
 */
type ZodApiResponseOptions = Omit<ApiResponseOptions, 'type' | 'content'> & {
  /** The Zod schema to use for the response type */
  schema: z.ZodType;
  /** Set to true if the response is an array of this schema */
  isArray?: boolean;
};

/**
 * Custom @ApiResponse decorator that accepts Zod schemas directly.
 * Uses $ref to reference registered schemas for proper deduplication.
 *
 * @example
 * // Single object response
 * @ZodApiResponse({ status: 200, description: 'Returns the user', schema: UserSchema })
 *
 * @example
 * // Array response
 * @ZodApiResponse({ status: 200, description: 'Returns all users', schema: UserSchema, isArray: true })
 */
export function ZodApiResponse(options: ZodApiResponseOptions) {
  const { schema, isArray, ...rest } = options;
  const jsonSchema = schemaToJsonSchema(schema, isArray);

  return ApiResponse({
    ...rest,
    content: {
      'application/json': {
        schema: jsonSchema,
      },
    },
  });
}

/**
 * Options for ZodApiBody decorator.
 */
type ZodApiBodyOptions = Omit<ApiBodyOptions, 'type'> & {
  /** The Zod schema to use for the request body type */
  schema: z.ZodType;
};

/**
 * Custom @ApiBody decorator that accepts Zod schemas directly.
 * Uses $ref to reference registered schemas for proper deduplication.
 *
 * @example
 * @ZodApiBody({ schema: CreateUserDtoSchema })
 */
export function ZodApiBody(options: ZodApiBodyOptions) {
  const { schema, ...rest } = options;
  const jsonSchema = schemaToJsonSchema(schema);

  return ApiBody({
    ...rest,
    schema: jsonSchema,
  });
}
