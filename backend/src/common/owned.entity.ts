import { Column, JoinColumn, ManyToOne } from 'typeorm';
import { UserEntity } from '../user/user.entity';
import { TimestampedEntity } from './base.entity';

/**
 * Base entity for user-owned resources.
 * Extends TimestampedEntity and adds userId/user relationship.
 * Most entities should extend this class.
 */
export abstract class OwnedEntity extends TimestampedEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { nullable: false })
  @JoinColumn({ name: 'userId' })
  user: UserEntity;
}
