import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum RawEventSource {
  PSP = 'psp',
  GSP = 'gsp',
}

export enum RawEventStatus {
  RECEIVED = 'received',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

@Entity('raw_events')
@Index('idx_raw_events_brand_status', ['brandId', 'status'])
export class RawEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: RawEventSource, enumName: 'raw_event_source' })
  source: RawEventSource;

  @Column({ type: 'varchar', length: 64 })
  provider: string;

  @Column({ type: 'varchar', length: 64 })
  brandId: string;

  @Column({ type: 'varchar', length: 255 })
  externalEventId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  headers: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: RawEventStatus,
    enumName: 'raw_event_status',
    default: RawEventStatus.RECEIVED,
  })
  status: RawEventStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
