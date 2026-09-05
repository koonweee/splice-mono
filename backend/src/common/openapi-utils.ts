/**
 * Transform nullable $ref patterns in OpenAPI spec for better orval compatibility.
 *
 * zod-to-openapi generates: { allOf: [{ $ref: "..." }, { nullable: true }] }
 * orval doesn't handle this well, generating broken intersection types.
 *
 * This transforms it to: { oneOf: [{ $ref: "..." }, { type: "null" }] }
 * which orval correctly generates as: Type | null
 */
export function fixNullableRefs(obj: unknown): unknown {
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
