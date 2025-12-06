/**
 * Interface for entities that support CRUD operations via base services.
 *
 * All entities used with BaseCrudService or OwnedCrudService must implement
 * this interface to ensure consistent conversion between entity and domain objects.
 *
 * @template TDomain - The domain type returned by toObject()
 *
 * @example
 * ```typescript
 * class AccountEntity implements CrudEntity<Account> {
 *   toObject(): Account {
 *     return {
 *       id: this.id,
 *       name: this.name,
 *       // ... map all fields
 *     };
 *   }
 * }
 * ```
 */
export interface CrudEntity<TDomain> {
  /**
   * Convert this entity instance to a domain object.
   *
   * This method should map all entity fields (including embedded columns)
   * to their corresponding domain type representation.
   *
   * @returns The domain object representation of this entity
   */
  toObject(): TDomain;
}

/**
 * Static interface for entity classes that can be instantiated from DTOs.
 *
 * Entity classes must implement a static `fromDto` method that creates
 * new entity instances from DTOs. The signature varies based on whether
 * the entity is owned (requires userId) or not.
 *
 * @template TEntity - The entity class type
 * @template TCreateDto - The DTO type used to create entities
 *
 * @example
 * ```typescript
 * // For owned entities (extends OwnedEntity):
 * class AccountEntity {
 *   static fromDto(dto: CreateAccountDto, userId: string): AccountEntity {
 *     const entity = new AccountEntity();
 *     entity.userId = userId;
 *     entity.name = dto.name;
 *     return entity;
 *   }
 * }
 *
 * // For non-owned entities:
 * class WebhookEventEntity {
 *   static fromDto(dto: CreateWebhookEventDto): WebhookEventEntity {
 *     const entity = new WebhookEventEntity();
 *     entity.webhookId = dto.webhookId;
 *     return entity;
 *   }
 * }
 * ```
 */
export interface CrudEntityClass<TEntity, TCreateDto> {
  /**
   * Create a new entity instance from a DTO.
   *
   * For owned entities, this method should also accept a userId parameter
   * to set the ownership relationship.
   *
   * @param dto - The creation DTO containing field values
   * @param args - Additional arguments (e.g., userId for owned entities)
   * @returns A new entity instance (not yet persisted)
   */
  fromDto(dto: TCreateDto, ...args: unknown[]): TEntity;

  /**
   * Constructor signature for creating instances.
   */
  new (): TEntity;
}
