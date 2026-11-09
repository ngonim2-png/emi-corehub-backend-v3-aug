import { Response } from 'express';

export function sendExcelFile(res: Response, buffer: Buffer, filename: string): void {
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}
