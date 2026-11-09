import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/**
 * A staff-uploaded .docx template with {{placeholder}} tokens. Storage
 * reuses the same FileStorageAdapter as the rest of the documents
 * module - a template is just a document that happens to get filled in
 * before it's downloaded, not a separate storage concept.
 *
 * productId null means "general template" - used when no
 * product-specific one exists for a given policy's product. Multiple
 * templates can exist; generation picks the product-specific one first,
 * falling back to the most recent general template.
 */
@Entity('policy_document_templates')
export class PolicyDocumentTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  storageKey: string;

  @Column({ type: 'uuid', nullable: true })
  productId: string | null;

  @Column({ type: 'uuid' })
  uploadedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
