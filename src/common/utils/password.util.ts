import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const derived = (await scrypt(plain, salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(hash, 'hex');
  if (storedBuffer.length !== derived.length) return false;
  return timingSafeEqual(storedBuffer, derived);
}
