// utils/encryptionUtil.js

/*
This handles encrypting KYC documents and live webcam captures before uploading to ImageKit, and decrypting them on-the-fly when requested by the KYC officer.
*/

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

module.exports = { encryptBuffer, decryptBuffer };