import type { ObjectLiteral, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/** Bulk SQL writes mapped columns only, never entity relations or cascading saves. */
export function mappedWriteValues<T extends ObjectLiteral>(
  repository: Repository<T>,
  entities: T[],
): QueryDeepPartialEntity<T>[] {
  return entities.map((entity) => {
    const row: Record<string, unknown> = {};
    for (const column of repository.metadata.columns) {
      const value: unknown = column.getEntityValue(entity);
      if (value !== undefined) column.setEntityValue(row, value);
    }
    // TypeORM's recursive partial cannot express arbitrary JSON; metadata enforces the column boundary.
    return row as QueryDeepPartialEntity<T>;
  });
}
