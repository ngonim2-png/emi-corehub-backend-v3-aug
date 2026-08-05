import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocumentEntity } from './document.entity';
import { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { FILE_STORAGE, FileStorageAdapter } from './adapters/file-storage.adapter';

export interface UploadDocumentInput {
  name: string;
  category: string;
  relatedType: string;
  relatedId?: string;
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(DocumentEntity) private readonly documentsRepo: Repository<DocumentEntity>,
    @Inject(FILE_STORAGE) private readonly storage: FileStorageAdapter,
  ) {}

  /**
   * Real upload path: the file's bytes are actually written via the
   * configured FileStorageAdapter (local disk by default - see that
   * adapter's own comment for the platform caveat), and the resulting
   * storage key is what gets recorded, not a placeholder.
   */
  async upload(
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    input: UploadDocumentInput,
    actor: AuthenticatedUser,
  ): Promise<DocumentEntity> {
    const stored = await this.storage.save(fileBuffer, originalFilename, mimeType);
    return this.documentsRepo.save(
      this.documentsRepo.create({
        name: input.name,
        category: input.category,
        relatedType: input.relatedType,
        relatedId: input.relatedId ?? null,
        storageKey: stored.storageKey,
        mimeType,
        sizeBytes: stored.sizeBytes,
        version: 1,
        uploadedBy: actor.id,
      }),
    );
  }

  async download(id: string): Promise<{ buffer: Buffer; document: DocumentEntity }> {
    const document = await this.documentsRepo.findOne({ where: { id } });
    if (!document) throw new NotFoundException('Document not found');
    const buffer = await this.storage.read(document.storageKey);
    return { buffer, document };
  }

  async findByRelated(relatedType: string, relatedId: string): Promise<DocumentEntity[]> {
    return this.documentsRepo.find({ where: { relatedType, relatedId }, order: { createdAt: 'DESC' } });
  }

  /** Full registry view - the Documents tab lists everything, optionally filtered by category. */
  async findAll(category?: string): Promise<DocumentEntity[]> {
    return this.documentsRepo.find({
      where: category ? { category } : {},
      order: { createdAt: 'DESC' },
      take: 200,
    });
  }
}
