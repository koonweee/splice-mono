import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { TimestampedEntity } from '../common/base.entity';

@Entity()
@Unique(['userId', 'categoryId'])
export class CategoryVisibilityPreferenceEntity extends TimestampedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  categoryId: string;

  @Column({ type: 'timestamptz', nullable: true })
  hiddenAt: Date | null;
}
