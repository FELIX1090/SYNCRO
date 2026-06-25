import crypto from 'crypto';
import { env } from '../config/env';

// Use a dedicated ENCRYPTION_KEY if available, fallback to JWT_SECRET for backward compatibility
// Must be exactly 32 bytes for AES-256
const getEncryptionKey = (): Buffer => {
  const keySource = env.ENCRYPTION_KEY || env.JWT_SECRET || '';
  // Hash the source to ensure it's exactly 32 bytes
  return crypto.createHash('sha256').update(String(keySource)).digest();
};

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts a string using AES-256-GCM.
 * @param text The plain text to encrypt.
 * @returns The encrypted string in the format: iv:tag:encryptedText
 */
export function encrypt(text: string): string {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  
  const cipher = crypto.createCipheriv(ALGORITHM, iv, key);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  // Format: iv:tag:encrypted
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string encrypted with AES-256-GCM.
 * @param encryptedText The encrypted text in the format: iv:tag:encryptedText.
 * @returns The decrypted plain text.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(':')) {
    // Return as-is if it doesn't look like an encrypted string (e.g., legacy unencrypted token)
    return encryptedText;
  }
  
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText;
    
    const [ivHex, tagHex, encryptedDataHex] = parts;
    
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = getEncryptionKey();
    
    const decipher = crypto.createDecipheriv(ALGORITHM, iv, key);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // If decryption fails, return original text. It might be unencrypted legacy data.
    return encryptedText;
  }
}

/**
 * Encrypts a string using AES-256-GCM with a user-derived key.
 * @param text The plain text to encrypt.
 * @param userId The ID of the user whose derived key should be used.
 * @returns The encrypted string in the format: iv:tag:encryptedText
 */
export function encryptForUser(text: string, userId: string): string {
  if (!text) return text;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  // Import dynamically/lazily to avoid potential circular dependency issues
  const { privacyService } = require('../services/privacy-service');
  const key = privacyService.getUserDerivedKey(userId);
  
  const cipher = crypto.createCipheriv(ALGORITHM, iv, key);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string using AES-256-GCM with a user-derived key.
 * @param encryptedText The encrypted text in the format: iv:tag:encryptedText.
 * @param userId The ID of the user whose derived key should be used.
 * @returns The decrypted plain text.
 */
export function decryptForUser(encryptedText: string, userId: string): string {
  if (!encryptedText || !encryptedText.includes(':')) {
    return encryptedText;
  }
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) return encryptedText;
  
  const [ivHex, tagHex, encryptedDataHex] = parts;
  
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  
  // Import dynamically/lazily to avoid potential circular dependency issues
  const { privacyService } = require('../services/privacy-service');
  const key = privacyService.getUserDerivedKey(userId);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, iv, key);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encryptedDataHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

