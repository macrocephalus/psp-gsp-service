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

  // 128, не 64: scope = `<source>:<provider>`, провайдер сам по себе
  // может занимать 64 символа (лимит валидации в guard)
  @Column({ type: 'varchar', length: 128 })
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
