/**
 * TypeORM's PostgresQueryRunner returns DELETE/UPDATE queries as
 * `[returningRows, rowCount]` when structured results are not requested.
 * Fail closed on malformed or internally inconsistent driver output.
 */
export function getPostgresMutationAffectedCount(result: unknown): number {
  if (
    !Array.isArray(result) ||
    result.length !== 2 ||
    !Array.isArray(result[0]) ||
    typeof result[1] !== 'number' ||
    !Number.isInteger(result[1]) ||
    result[1] < 0
  ) {
    throw new Error('Unexpected PostgreSQL mutation result');
  }
  if (result[0].length !== result[1]) {
    throw new Error('Inconsistent PostgreSQL mutation result');
  }
  return result[1];
}
