import { Logger } from '@nestjs/common';
import { FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';
import { CrudEntity } from './crud-entity.interface';

/**
 * Interface for entities that have an id and userId field.
 * All entities extending OwnedEntity satisfy this interface.
 */
interface OwnedEntityLike {
  id: string;
  userId: string;
}

/**
 * Extended entity class interface for owned entities.
 * The fromDto method requires a userId parameter.
 */
interface OwnedCrudEntityClass<TEntity, TCreateDto> {
  /**
   * Create a new entity instance from a DTO with user ownership.
   *
   * @param dto - The creation DTO containing field values
   * @param userId - The ID of the user who owns this entity
   * @returns A new entity instance (not yet persisted)
   */
  fromDto(dto: TCreateDto, userId: string): TEntity;

  /**
   * Constructor signature for creating instances.
   */
  new (): TEntity;
}

/**
 * Abstract base service providing standard CRUD operations for user-owned entities.
 *
 * This class extends the functionality of {@link BaseCrudService} by adding userId
 * scoping to all operations. Use this for entities that extend OwnedEntity and
 * require user-based access control.
 *
 * All CRUD operations are automatically scoped to the provided userId, ensuring
 * users can only access their own data.
 *
 * For entities without user ownership, use {@link BaseCrudService} instead.
 *
 * @template TEntity - The TypeORM entity class type. Must extend OwnedEntity and implement {@link CrudEntity}
 * @template TDomain - The domain/DTO type returned by entity.toObject()
 * @template TCreateDto - The DTO type used for creating entities
 * @template TUpdateDto - The DTO type used for updating entities
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class AccountService extends OwnedCrudService<
 *   AccountEntity,
 *   Account,
 *   CreateAccountDto,
 *   UpdateAccountDto
 * > {
 *   protected readonly logger = new Logger(AccountService.name);
 *   protected readonly entityName = 'Account';
 *   protected readonly EntityClass = AccountEntity;
 *   protected readonly relations = ['bankLink'];
 *
 *   constructor(
 *     @InjectRepository(AccountEntity)
 *     repository: Repository<AccountEntity>,
 *   ) {
 *     super(repository);
 *   }
 *
 *   protected applyUpdate(entity: AccountEntity, dto: UpdateAccountDto): void {
 *     if (dto.name !== undefined) entity.name = dto.name;
 *     if (dto.type !== undefined) entity.type = dto.type;
 *   }
 * }
 * ```
 */
export abstract class OwnedCrudService<
  TEntity extends CrudEntity<TDomain> & OwnedEntityLike & ObjectLiteral,
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
   * protected readonly logger = new Logger(AccountService.name);
   * ```
   */
  protected abstract readonly logger: Logger;

  /**
   * Human-readable name for this entity type, used in log messages.
   *
   * Should be singular and PascalCase (e.g., "Account", "BalanceSnapshot").
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
  protected abstract readonly EntityClass: OwnedCrudEntityClass<
    TEntity,
    TCreateDto
  >;

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
   * Create a new OwnedCrudService instance.
   *
   * @param repository - The TypeORM repository for the entity type.
   *                     Inject this using @InjectRepository(EntityClass) in the subclass.
   */
  constructor(protected readonly repository: Repository<TEntity>) {}

  /**
   * Create a new entity from a DTO and persist it to the database.
   *
   * The entity will be owned by the specified user and can only be
   * accessed by that user in subsequent operations.
   *
   * This method:
   * 1. Logs the creation attempt with userId
   * 2. Calls EntityClass.fromDto(dto, userId) to create the entity
   * 3. Saves the entity to the database
   * 4. Returns the domain object via entity.toObject()
   *
   * @param dto - The creation DTO containing field values
   * @param userId - The ID of the user who will own this entity
   * @returns Promise resolving to the created domain object
   *
   * @example
   * ```typescript
   * const account = await accountService.create(
   *   {
   *     name: 'Checking',
   *     type: 'depository',
   *     availableBalance: { amount: 1000, currency: 'USD', isCredit: false },
   *     currentBalance: { amount: 1000, currency: 'USD', isCredit: false },
   *   },
   *   'user-uuid-here',
   * );
   * ```
   */
  async create(dto: TCreateDto, userId: string): Promise<TDomain> {
    this.logger.log({ userId }, `Creating ${this.entityName}`);

    const entity = this.EntityClass.fromDto(dto, userId);
    const savedEntity = await this.repository.save(entity);

    this.logger.log(
      { id: savedEntity.id },
      `${this.entityName} created successfully`,
    );
    return savedEntity.toObject();
  }

  /**
   * Find a single entity by its ID, scoped to the specified user.
   *
   * This method ensures users can only access their own entities by
   * including userId in the query conditions.
   *
   * This method:
   * 1. Logs the lookup attempt with id and userId
   * 2. Queries the database with userId scoping and configured relations
   * 3. Returns null if not found (or not owned by user), or the domain object if found
   *
   * @param id - The UUID of the entity to find
   * @param userId - The ID of the user requesting the entity
   * @returns Promise resolving to the domain object, or null if not found/not owned
   *
   * @example
   * ```typescript
   * const account = await accountService.findOne('account-uuid', 'user-uuid');
   * if (!account) {
   *   throw new NotFoundException('Account not found');
   * }
   * ```
   */
  async findOne(id: string, userId: string): Promise<TDomain | null> {
    this.logger.log({ id, userId }, `Finding ${this.entityName}`);

    const entity = await this.repository.findOne({
      where: { id, userId } as unknown as FindOptionsWhere<TEntity>,
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        `${this.entityName} not found`,
      );
      return null;
    }

    this.logger.log({ id }, `${this.entityName} found`);
    return entity.toObject();
  }

  /**
   * Find all entities owned by the specified user.
   *
   * This method returns only entities belonging to the given userId,
   * ensuring proper data isolation between users.
   *
   * This method:
   * 1. Logs the query with userId
   * 2. Fetches all entities for the user with configured relations
   * 3. Maps each entity to its domain object
   *
   * @param userId - The ID of the user whose entities to fetch
   * @returns Promise resolving to an array of domain objects
   *
   * @example
   * ```typescript
   * const userAccounts = await accountService.findAll('user-uuid');
   * console.log(`User has ${userAccounts.length} accounts`);
   * ```
   */
  async findAll(userId: string): Promise<TDomain[]> {
    this.logger.log({ userId }, `Finding all ${this.entityName}s`);

    const entities = await this.repository.find({
      where: { userId } as unknown as FindOptionsWhere<TEntity>,
      relations: this.relations,
    });

    this.logger.log(
      { userId, count: entities.length },
      `Found ${this.entityName}s`,
    );
    return entities.map((entity) => entity.toObject());
  }

  /**
   * Apply update DTO fields to an existing entity.
   *
   * Subclasses MUST implement this method to define how update DTOs
   * are applied to entities. Only update fields that are explicitly
   * provided (not undefined) in the DTO.
   *
   * This method is called by update() after the entity is fetched and
   * before it is saved.
   *
   * @param entity - The existing entity to update (will be mutated)
   * @param dto - The update DTO containing fields to change
   *
   * @example
   * ```typescript
   * protected applyUpdate(entity: AccountEntity, dto: UpdateAccountDto): void {
   *   // Only update fields that are explicitly provided
   *   if (dto.name !== undefined) entity.name = dto.name;
   *   if (dto.type !== undefined) entity.type = dto.type;
   *
   *   // Handle complex field transformations
   *   if (dto.availableBalance !== undefined) {
   *     entity.availableBalance = BalanceColumns.fromMoneyWithSign(dto.availableBalance);
   *   }
   * }
   * ```
   */
  protected abstract applyUpdate(entity: TEntity, dto: TUpdateDto): void;

  /**
   * Update an existing entity with new field values, scoped to the specified user.
   *
   * This method ensures users can only update their own entities by
   * including userId in the query conditions.
   *
   * This method:
   * 1. Logs the update attempt with id and userId
   * 2. Fetches the existing entity (with userId scoping)
   * 3. Returns null if not found or not owned by user
   * 4. Calls applyUpdate() to apply DTO fields
   * 5. Saves and returns the updated domain object
   *
   * @param id - The UUID of the entity to update
   * @param dto - The update DTO containing fields to change
   * @param userId - The ID of the user requesting the update
   * @returns Promise resolving to the updated domain object, or null if not found/not owned
   *
   * @example
   * ```typescript
   * const updated = await accountService.update(
   *   'account-uuid',
   *   { name: 'New Account Name' },
   *   'user-uuid',
   * );
   * if (!updated) {
   *   throw new NotFoundException('Account not found');
   * }
   * ```
   */
  async update(
    id: string,
    dto: TUpdateDto,
    userId: string,
  ): Promise<TDomain | null> {
    this.logger.log({ id, userId }, `Updating ${this.entityName}`);

    const entity = await this.repository.findOne({
      where: { id, userId } as unknown as FindOptionsWhere<TEntity>,
      relations: this.relations,
    });

    if (!entity) {
      this.logger.warn(
        { id, userId },
        `${this.entityName} not found for update`,
      );
      return null;
    }

    this.applyUpdate(entity, dto);

    const savedEntity = await this.repository.save(entity);
    this.logger.log({ id }, `${this.entityName} updated successfully`);
    return savedEntity.toObject();
  }

  /**
   * Remove an entity by its ID, scoped to the specified user.
   *
   * This method ensures users can only delete their own entities by
   * including userId in the delete conditions.
   *
   * This method:
   * 1. Logs the removal attempt with id and userId
   * 2. Deletes the entity from the database (with userId scoping)
   * 3. Returns true if deleted, false if not found or not owned by user
   *
   * @param id - The UUID of the entity to remove
   * @param userId - The ID of the user requesting the removal
   * @returns Promise resolving to true if deleted, false if not found/not owned
   *
   * @example
   * ```typescript
   * const deleted = await accountService.remove('account-uuid', 'user-uuid');
   * if (!deleted) {
   *   throw new NotFoundException('Account not found');
   * }
   * ```
   */
  async remove(id: string, userId: string): Promise<boolean> {
    this.logger.log({ id, userId }, `Removing ${this.entityName}`);

    const result = await this.repository.delete({
      id,
      userId,
    } as unknown as FindOptionsWhere<TEntity>);
    const success =
      result.affected !== null &&
      result.affected !== undefined &&
      result.affected > 0;

    if (success) {
      this.logger.log({ id }, `${this.entityName} removed successfully`);
    } else {
      this.logger.warn(
        { id, userId },
        `${this.entityName} not found for removal`,
      );
    }

    return success;
  }
}
