import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('idempotency_keys')
@Unique('uq_idempotency_scope_brand_key', ['scope', 'brandId', 'key'])
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64 })
  scope: string;

  @Column({ type: 'varchar', length: 64 })
  brandId: string;

  @Column({ type: 'varchar', length: 512 })
  key: string;

  @Column({ type: 'uuid', nullable: true })
  rawEventId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
