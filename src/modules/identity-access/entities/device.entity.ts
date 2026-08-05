import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn } from 'typeorm';
import { UserEntity } from './user.entity';

/**
 * Field marketers must post payments only from an approved device
 * (specification section 21, "Device registration for marketers").
 * PaymentsService checks `approved` before accepting a field payment.
 */
@Entity('devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity)
  user: UserEntity;

  @Column()
  deviceFingerprint: string;

  @Column({ default: false })
  approved: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
