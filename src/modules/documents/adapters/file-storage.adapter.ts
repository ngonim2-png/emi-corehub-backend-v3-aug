export interface StoredFile {
  /** Opaque key the adapter needs to retrieve the file again - a local path for LocalDiskAdapter, an object key for a future S3Adapter. Never expose this directly to the frontend as a URL. */
  storageKey: string;
  sizeBytes: number;
}

/**
 * Every file upload in the app goes through this interface, never a
 * concrete adapter class directly - same reasoning as SmsGatewayAdapter
 * and EmailGatewayAdapter. Swapping to real S3/MinIO later is a change
 * entirely inside a new adapter class plus the provider binding in
 * documents.module.ts.
 */
export interface FileStorageAdapter {
  save(buffer: Buffer, originalFilename: string, mimeType: string): Promise<StoredFile>;
  /** Returns the file's bytes for streaming back on download. */
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export const FILE_STORAGE = 'FILE_STORAGE';
