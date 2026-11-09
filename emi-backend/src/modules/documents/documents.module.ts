import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEntity } from './document.entity';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { FILE_STORAGE } from './adapters/file-storage.adapter';
import { LocalDiskStorageAdapter } from './adapters/local-disk-storage.adapter';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEntity])],
  providers: [
    DocumentsService,
    { provide: FILE_STORAGE, useClass: LocalDiskStorageAdapter },
  ],
  controllers: [DocumentsController],
  exports: [DocumentsService, FILE_STORAGE],
})
export class DocumentsModule {}
