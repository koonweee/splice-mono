import type { ObjectLiteral, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

/** Pass only mapped columns to bulk SQL; entity relations/methods must never become cascading writes. */
export function investmentWriteValues<T extends ObjectLiteral>(
  repository: Repository<T>,
  entities: T[],
): QueryDeepPartialEntity<T>[] {
  return entities.map((entity) => {
    const row: Record<string, unknown> = {};
    for (const column of repository.metadata.columns) {
      const value: unknown = column.getEntityValue(entity);
      if (value !== undefined) column.setEntityValue(row, value);
    }
    // TypeORM's recursive partial type cannot express JSON payloads; metadata above enforces the column boundary.
    return row as QueryDeepPartialEntity<T>;
  });
}
