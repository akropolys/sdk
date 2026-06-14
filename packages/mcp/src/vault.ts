import crypto from 'crypto';

export interface CredentialVault {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export class LocalAESVault implements CredentialVault {
  private masterKey: Buffer;

  constructor(masterKeyEnvVar = 'AKROPOLYS_KMS_MASTER_KEY') {
    const keyStr = process.env[masterKeyEnvVar];
    if (!keyStr) {
      throw new Error(`Master key environment variable ${masterKeyEnvVar} is not defined`);
    }
    // Hash the master key to ensure it is exactly 32 bytes for AES-256
    this.masterKey = crypto.createHash('sha256').update(keyStr).digest();
  }

  async encrypt(plaintext: string): Promise<string> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey, iv);
    
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  async decrypt(ciphertext: string): Promise<string> {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedData = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}
