// utils/encryptionUtil.js
const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-gcm';
// Convert the 64-char hex string from .env into a 32-byte Buffer
const SECRET_KEY = Buffer.from(process.env.KYC_ENCRYPTION_KEY, 'hex');

function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]);
}

function decryptBuffer(encryptedBuffer) {
  const iv = encryptedBuffer.subarray(0, 12);
  const authTag = encryptedBuffer.subarray(12, 28);
  const data = encryptedBuffer.subarray(28);

  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Encrypts a string (e.g., Razorpay Key Secret) into a colon-delimited hex string: iv:authTag:encryptedData
 */
function encryptText(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted hex string back to original plain text
 */
function decryptText(cipherText) {
  if (!cipherText) return null;
  const parts = cipherText.split(':');
  if (parts.length !== 3) return cipherText; // Fallback if plain text was stored

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  encryptText,
  decryptText,
};