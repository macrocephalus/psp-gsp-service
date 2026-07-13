import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('users')
@Unique('uq_users_brand_email', ['brandId', 'email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_users_brand_id')
  @Column({ type: 'varchar', length: 64 })
  brandId: string;

  @Column({ type: 'varchar', length: 320 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
