import type { CryptoSignature } from '../types';

const KEY_DB_NAME = 'xcm-pdf-crypto-db';
const KEY_STORE_NAME = 'keypairs';
const KEY_ID = 'active';

interface StoredKeyPair {
  id: string;
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;

  async generateKeyPair(): Promise<CryptoKeyPair> {
    this.keyPair = await window.crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
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
        const migrated = await this.migrateLegacyLocalStorageKeys();
        if (migrated) {
          this.keyPair = migrated;
          await this.saveKeyPairToStorage();
          this.clearLegacyLocalStorageKeys();
          return this.keyPair;
        }

        await this.generateKeyPair();
        await this.saveKeyPairToStorage();
      }
    }
    return this.keyPair!;
  }

  private async saveKeyPairToStorage(): Promise<void> {
    if (!this.keyPair) return;

    const db = await this.openKeyDatabase();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KEY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(KEY_STORE_NAME);
      const value: StoredKeyPair = {
        id: KEY_ID,
        publicKey: this.keyPair!.publicKey,
        privateKey: this.keyPair!.privateKey,
      };

      store.put(value);

      tx.oncomplete = () => {
        db.close();
        resolve();
      };

      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('Failed to persist key pair'));
      };
    });
  }

  private async loadKeyPairFromStorage(): Promise<CryptoKeyPair | null> {
    try {
      const db = await this.openKeyDatabase();

      const stored = await new Promise<StoredKeyPair | undefined>((resolve, reject) => {
        const tx = db.transaction(KEY_STORE_NAME, 'readonly');
        const store = tx.objectStore(KEY_STORE_NAME);
        const request = store.get(KEY_ID);

        request.onsuccess = () => resolve(request.result as StoredKeyPair | undefined);
        request.onerror = () => reject(request.error ?? new Error('Failed to read key pair'));
      });

      db.close();

      if (!stored?.publicKey || !stored?.privateKey) {
        return null;
      }

      return {
        publicKey: stored.publicKey,
        privateKey: stored.privateKey,
      };
    } catch {
      return null;
    }
  }

  private async migrateLegacyLocalStorageKeys(): Promise<CryptoKeyPair | null> {
    const publicKeyJson = localStorage.getItem('xcm-pdf-public-key');
    const privateKeyJson = localStorage.getItem('xcm-pdf-private-key');

    if (!publicKeyJson || !privateKeyJson) return null;

    try {
      const publicKeyJwk = JSON.parse(publicKeyJson);
      const privateKeyJwk = JSON.parse(privateKeyJson);

      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        true,
        ['verify']
      );

      const privateKey = await window.crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'RSA-PSS', hash: 'SHA-256' },
        true,
        ['sign']
      );

      return { publicKey, privateKey };
    } catch {
      return null;
    }
  }

  private clearLegacyLocalStorageKeys(): void {
    localStorage.removeItem('xcm-pdf-public-key');
    localStorage.removeItem('xcm-pdf-private-key');
  }

  private async openKeyDatabase(): Promise<IDBDatabase> {
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(KEY_DB_NAME, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(KEY_STORE_NAME)) {
          db.createObjectStore(KEY_STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open key database'));
    });
  }

  async signData(data: ArrayBuffer): Promise<CryptoSignature> {
    const keyPair = await this.getOrCreateKeyPair();

    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const signature = await window.crypto.subtle.sign(
      { name: 'RSA-PSS', saltLength: 32 },
      keyPair.privateKey,
      hashBuffer
    );

    const signatureArray = Array.from(new Uint8Array(signature));
    const signatureBase64 = btoa(String.fromCharCode(...signatureArray));

    const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);

    return {
      publicKey: JSON.stringify(publicKeyJwk),
      signature: signatureBase64,
      algorithm: 'RSA-PSS-SHA256',
      timestamp: Date.now(),
      hash: hashHex,
    };
  }

  async verifySignature(data: ArrayBuffer, cryptoSig: CryptoSignature): Promise<boolean> {
    try {
      const publicKeyJwk = JSON.parse(cryptoSig.publicKey);
      const isLegacyPkcs1 = cryptoSig.algorithm.startsWith('RSASSA-PKCS1-v1_5');
      const keyAlgorithm = isLegacyPkcs1 ? 'RSASSA-PKCS1-v1_5' : 'RSA-PSS';

      const publicKey = await window.crypto.subtle.importKey(
        'jwk',
        publicKeyJwk,
        { name: keyAlgorithm, hash: 'SHA-256' },
        true,
        ['verify']
      );

      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);

      const signatureBytes = Uint8Array.from(atob(cryptoSig.signature), c => c.charCodeAt(0));

      return await window.crypto.subtle.verify(
        isLegacyPkcs1 ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'RSA-PSS', saltLength: 32 },
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
