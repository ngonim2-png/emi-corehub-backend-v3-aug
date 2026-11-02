import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Photos/documents uploaded through the app (claim documents, passport
 * photos, ID cards). Stored in the database itself rather than on the
 * server's disk on purpose: on Render the server's disk is wiped on every
 * redeploy, and a claim document must never disappear.
 */
@Entity('app_files')
export class AppFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 'application' | 'claim' | 'request' */
  @Index()
  @Column()
  ownerType: string;

  @Index()
  @Column({ type: 'uuid' })
  ownerId: string;

  @Column()
  kind: string;

  @Column()
  filename: string;

  @Column()
  mimeType: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'bytea' })
  data: Buffer;

  @CreateDateColumn()
  createdAt: Date;
}
