import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** Chiffrement AES-256-GCM des secrets SFTP. Clé : env SYNC_ENC_KEY (64 hex). */

function key(): Buffer {
  const hex = process.env.SYNC_ENC_KEY ?? '';
  if (hex.length !== 64) {
    throw new Error('SYNC_ENC_KEY manquante ou invalide (attendu : 64 caractères hex)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}

export function decryptSecret(enc: string): string {
  const [iv, tag, data] = enc.split(':').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
