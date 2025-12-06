import { Logger } from '@nestjs/common';
import { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import { CrudEntity, CrudEntityClass } from './crud-entity.interface';

/**
 * Interface for entities that have an id field.
 */
interface EntityWithId {
  id: string;
}

/**
 * Abstract base service providing standard CRUD operations for non-owned entities.
 *
 * This class eliminates repetitive CRUD boilerplate by providing default implementations
 * for create, findOne, findAll, update, and remove operations. Extend this class for
 * entities that don't require user ownership scoping.
 *
 * For user-owned entities (those extending OwnedEntity), use {@link OwnedCrudService} instead.
 *
 * @template TEntity - The TypeORM entity class type. Must implement {@link CrudEntity}
 * @template TDomain - The domain/DTO type returned by entity.toObject()
 * @template TCreateDto - The DTO type used for creating entities
 * @template TUpdateDto - The DTO type used for updating entities
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class WebhookEventService extends BaseCrudService<
 *   WebhookEventEntity,
 *   WebhookEvent,
 *   CreateWebhookEventDto,
 *   UpdateWebhookEventDto
 * > {
 *   protected readonly logger = new Logger(WebhookEventService.name);
 *   protected readonly entityName = 'WebhookEvent';
 *   protected readonly EntityClass = WebhookEventEntity;
 *
 *   constructor(
 *     @InjectRepository(WebhookEventEntity)
 *     repository: Repository<WebhookEventEntity>,
 *   ) {
 *     super(repository);
 *   }
 *
 *   protected applyUpdate(entity: WebhookEventEntity, dto: UpdateWebhookEventDto): void {
 *     if (dto.status !== undefined) entity.status = dto.status;
 *     if (dto.webhookContent !== undefined) entity.webhookContent = dto.webhookContent;
 *   }
 * }
 * ```
 */
export abstract class BaseCrudService<
  TEntity extends CrudEntity<TDomain> & EntityWithId & ObjectLiteral,
  TDomain,
  TCreateDto,
  TUpdateDto,
> {
  /**
   * Logger instance for this service.
   *
   * Subclasses must provide their own logger with the appropriate context name.
   *
   * @example
   * ```typescript
   * protected readonly logger = new Logger(MyService.name);
   * ```
   */
  protected abstract readonly logger: Logger;

  /**
   * Human-readable name for this entity type, used in log messages.
   *
   * Should be singular and PascalCase (e.g., "Account", "WebhookEvent").
   *
   * @example
   * ```typescript
   * protected readonly entityName = 'Account';
   * ```
   */
  protected abstract readonly entityName: string;

  /**
   * The entity class constructor, used to call static methods like fromDto().
   *
   * This must be set to the actual entity class so the base service can
   * create new instances from DTOs.
   *
   * @example
   * ```typescript
   * protected readonly EntityClass = AccountEntity;
   * ```
   */
  protected abstract readonly EntityClass: CrudEntityClass<TEntity, TCreateDto>;

  /**
   * Array of relation names to eager-load when fetching entities.
   *
   * Override this property to specify relations that should be loaded
   * with findOne and findAll operations.
   *
   * @default []
   *
   * @example
   * ```typescript
   * // Load the bankLink relation for Account entities
   * protected readonly relations = ['bankLink'];
   * ```
   */
  protected readonly relations: string[] = [];

  /**
   * Create a new BaseCrudService instance.
   *
   * @param repository - The TypeORM repository for the entity type.
   *                     Inject this using @InjectRepository(EntityClass) in the subclass.
   */
  constructor(protected readonly repository: Repository<TEntity>) {}

  /**
   * Create a new entity from a DTO and persist it to the database.
   *
   * This method:
   * 1. Logs the creation attempt
   * 2. Calls EntityClass.fromDto() to create the entity
   * 3. Saves the entity to the database
   * 4. Returns the domain object via entity.toObject()
   *
   * @param dto - The creation DTO containing field values
   * @returns Promise resolving to the created domain object
   *
   * @example
   * ```typescript
   * const webhookEvent = await webhookEventService.create({
   *   webhookId: 'wh_123',
   *   providerName: 'plaid',
   *   status: WebhookEventStatus.PENDING,
   * });
   * ```
   */
  async create(dto: TCreateDto): Promise<TDomain> {
    this.logger.log(`Creating ${this.entityName}`);

    const entity = this.EntityClass.fromDto(dto);
    const savedEntity = await this.repository.save(entity);

    this.logger.log(
      `${this.entityName} created successfully: id=${savedEntity.id}`,
    );
    return savedEntity.toObject();
  }

  /**
   * Find a single entity by its ID.
   *
   * This method:
   * 1. Logs the lookup attempt
   * 2. Queries the database with configured relations
   * 3. Returns null if not found, or the domain object if found
   *
   * @param id - The UUID of the entity to find
   * @returns Promise resolving to the domain object, or null if not found
   *
   * @example
   * ```typescript
   * const event = await webhookEventService.findOne('uuid-here');
   * if (!event) {
   *   throw new NotFoundException('Webhook event not found');
   * }
   * ```
   */
  async findOne(id: string): Promise<TDomain | null> {
    this.logger.log(`Finding ${this.entityName}: id=${id}`);

    const entity = await this.repository.findOne({
      where: { id } as unknown as FindOptionsWhere<TEntity>,
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(`${this.entityName} not found: id=${id}`);
      return null;
    }

    this.logger.log(`${this.entityName} found: id=${id}`);
    return entity.toObject();
  }

  /**
   * Find all entities of this type.
   *
   * This method:
   * 1. Logs the query
   * 2. Fetches all entities with configured relations
   * 3. Maps each entity to its domain object
   *
   * @returns Promise resolving to an array of domain objects
   *
   * @example
   * ```typescript
   * const allEvents = await webhookEventService.findAll();
   * console.log(`Found ${allEvents.length} webhook events`);
   * ```
   */
  async findAll(): Promise<TDomain[]> {
    this.logger.log(`Finding all ${this.entityName}s`);

    const entities = await this.repository.find({
      relations: this.relations,
    });

    this.logger.log(`Found ${entities.length} ${this.entityName}s`);
    return entities.map((entity) => entity.toObject());
  }

  /**
   * Apply update DTO fields to an existing entity.
   *
   * Subclasses MUST implement this method to define how update DTOs
   * are applied to entities. Only update fields that are explicitly
   * provided (not undefined) in the DTO.
   *
   * @param entity - The existing entity to update (will be mutated)
   * @param dto - The update DTO containing fields to change
   *
   * @example
   * ```typescript
   * protected applyUpdate(entity: WebhookEventEntity, dto: UpdateWebhookEventDto): void {
   *   // Only update fields that are explicitly provided
   *   if (dto.status !== undefined) entity.status = dto.status;
   *   if (dto.webhookContent !== undefined) {
   *     entity.webhookContent = dto.webhookContent ?? null;
   *   }
   *   if (dto.errorMessage !== undefined) {
   *     entity.errorMessage = dto.errorMessage ?? null;
   *   }
   * }
   * ```
   */
  protected abstract applyUpdate(entity: TEntity, dto: TUpdateDto): void;

  /**
   * Update an existing entity with new field values.
   *
   * This method:
   * 1. Logs the update attempt
   * 2. Fetches the existing entity
   * 3. Returns null if not found
   * 4. Calls applyUpdate() to apply DTO fields
   * 5. Saves and returns the updated domain object
   *
   * @param id - The UUID of the entity to update
   * @param dto - The update DTO containing fields to change
   * @returns Promise resolving to the updated domain object, or null if not found
   *
   * @example
   * ```typescript
   * const updated = await webhookEventService.update('uuid-here', {
   *   status: WebhookEventStatus.COMPLETED,
   * });
   * if (!updated) {
   *   throw new NotFoundException('Webhook event not found');
   * }
   * ```
   */
  async update(id: string, dto: TUpdateDto): Promise<TDomain | null> {
    this.logger.log(`Updating ${this.entityName}: id=${id}`);

    const entity = await this.repository.findOne({
      where: { id } as unknown as FindOptionsWhere<TEntity>,
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(`${this.entityName} not found for update: id=${id}`);
      return null;
    }

    this.applyUpdate(entity, dto);

    const savedEntity = await this.repository.save(entity);
    this.logger.log(`${this.entityName} updated successfully: id=${id}`);
    return savedEntity.toObject();
  }

  /**
   * Remove an entity by its ID.
   *
   * This method:
   * 1. Logs the removal attempt
   * 2. Deletes the entity from the database
   * 3. Returns true if deleted, false if not found
   *
   * @param id - The UUID of the entity to remove
   * @returns Promise resolving to true if deleted, false if not found
   *
   * @example
   * ```typescript
   * const deleted = await webhookEventService.remove('uuid-here');
   * if (!deleted) {
   *   throw new NotFoundException('Webhook event not found');
   * }
   * ```
   */
  async remove(id: string): Promise<boolean> {
    this.logger.log(`Removing ${this.entityName}: id=${id}`);

    const result = await this.repository.delete(id);
    const success =
      result.affected !== null &&
      result.affected !== undefined &&
      result.affected > 0;

    if (success) {
      this.logger.log(`${this.entityName} removed successfully: id=${id}`);
    } else {
      this.logger.warn(`${this.entityName} not found for removal: id=${id}`);
    }

    return success;
  }
}
