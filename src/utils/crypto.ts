import type { CryptoSignature } from '../types';

export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;

  async generateKeyPair(): Promise<CryptoKeyPair> {
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    return this.keyPair;
  }

  async getOrCreateKeyPair(): Promise<CryptoKeyPair> {
    if (!this.keyPair) {
      const stored = await this.loadKeyPairFromStorage();
      if (stored) {
        this.keyPair = stored;
      } else {
        await this.generateKeyPair();
        await this.saveKeyPairToStorage();
      }
    }
    return this.keyPair!;
  }

  private async saveKeyPairToStorage(): Promise<void> {
    if (!this.keyPair) return;

    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', this.keyPair.privateKey);

    localStorage.setItem('xcm-pdf-public-key', JSON.stringify(publicKeyJwk));
    localStorage.setItem('xcm-pdf-private-key', JSON.stringify(privateKeyJwk));
  }

  private async loadKeyPairFromStorage(): Promise<CryptoKeyPair | null> {
    const publicKeyJson = localStorage.getItem('xcm-pdf-public-key');
    const privateKeyJson = localStorage.getItem('xcm-pdf-private-key');

    if (!publicKeyJson || !privateKeyJson) return null;

    try {
      const publicKeyJwk = JSON.parse(publicKeyJson);
      const privateKeyJwk = JSON.parse(privateKeyJson);

      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify']
      );

      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['sign']
      );

      return { publicKey, privateKey };
    } catch {
      return null;
    }
  }

  async signData(data: ArrayBuffer): Promise<CryptoSignature> {
    const keyPair = await this.getOrCreateKeyPair();

    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const signature = await window.crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      keyPair.privateKey,
      hashBuffer
    );

    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

    return {
      publicKey: JSON.stringify(publicKeyJwk),
      signature: signatureBase64,
      algorithm: 'RSASSA-PKCS1-v1_5-SHA256',
      timestamp: Date.now(),
      hash: hashHex,
    };
  }

  async verifySignature(data: ArrayBuffer, cryptoSig: CryptoSignature): Promise<boolean> {
    try {
      const publicKeyJwk = JSON.parse(cryptoSig.publicKey);

      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        true,
        ['verify']
      );

      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

      const signatureBytes = Uint8Array.from(atob(cryptoSig.signature), c => c.charCodeAt(0));

      return await window.crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        signatureBytes,
        hashBuffer
      );
    } catch {
      return false;
    }
  }

  async exportPublicKey(): Promise<string> {
    const keyPair = await this.getOrCreateKeyPair();
    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
    return JSON.stringify(publicKeyJwk, null, 2);
  }

  getPublicKeyFingerprint(publicKey: string): string {
    const hash = this.simpleHash(publicKey);
    return hash.substring(0, 16).toUpperCase().match(/.{4}/g)?.join(':') || hash.substring(0, 16);
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

export const cryptoService = new CryptoService();
