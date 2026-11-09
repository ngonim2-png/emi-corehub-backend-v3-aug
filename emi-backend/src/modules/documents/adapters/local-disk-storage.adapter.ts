import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { FileStorageAdapter, StoredFile } from './file-storage.adapter';

/**
 * Writes uploaded files to disk on the server itself. Works out of the
 * box - no S3 bucket or credentials needed - which matters because this
 * is the default until a real object-storage adapter is configured.
 *
 * Important limitation, stated plainly rather than glossed over: on a
 * platform with an ephemeral filesystem (Render's default web service,
 * for example), anything written here is lost on every redeploy or
 * restart. This is fine for a self-hosted VPS/Docker Compose setup with
 * a mounted volume (see docker-compose.prod.yml), or for a managed
 * platform's persistent-disk add-on if one is configured - but not a
 * safe default for uploads you need to survive a Render redeploy
 * without a persistent disk attached.
 */
@Injectable()
export class LocalDiskStorageAdapter implements FileStorageAdapter {
  private readonly logger = new Logger(LocalDiskStorageAdapter.name);
  private readonly uploadDir: string;

  constructor(private readonly config: ConfigService) {
    this.uploadDir = this.config.get<string>('uploadDir') ?? path.join(process.cwd(), 'uploads');
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.uploadDir, { recursive: true });
  }

  async save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<StoredFile> {
    void mimeType;
    await this.ensureDir();
    const ext = path.extname(originalFilename).slice(0, 10); // cap extension length, ignore anything unreasonable
    const safeKey = `${crypto.randomUUID()}${ext}`;
    const fullPath = path.join(this.uploadDir, safeKey);
    await fs.writeFile(fullPath, buffer);
    this.logger.log(`Stored file ${safeKey} (${buffer.length} bytes)`);
    return { storageKey: safeKey, sizeBytes: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    // storageKey is always our own generated UUID-based filename, never
    // user input directly, so there is no path-traversal surface here -
    // still resolve and re-join through path.join rather than trusting
    // string concatenation.
    const fullPath = path.join(this.uploadDir, path.basename(storageKey));
    return fs.readFile(fullPath);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, path.basename(storageKey));
    await fs.unlink(fullPath).catch(() => undefined);
  }
}
