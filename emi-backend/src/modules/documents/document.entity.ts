import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('documents')
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  category: string;

  /** Polymorphic reference, e.g. relatedType='client', relatedId=client.id */
  @Column()
  relatedType: string;

  @Column({ type: 'uuid', nullable: true })
  relatedId: string | null;

  /** Opaque key the configured FileStorageAdapter needs to retrieve the file - a local filename by default, an S3 object key if that adapter is configured instead. Never construct a URL from this directly; always go through the download endpoint. */
  @Column()
  storageKey: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ type: 'int', nullable: true })
  sizeBytes: number | null;

  @Column({ default: 1 })
  version: number;

  @Column({ type: 'uuid' })
  uploadedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
