/**
 * Session vault — IndexedDB-backed crash recovery.
 *
 * Automatically saves the active document state so it can be
 * restored after an unintended page reload or browser crash.
 *
 * All public methods suppress errors silently: session
 * persistence is non-critical and must never break the editor.
 */

import type { Annotation } from '../types/index';

const DB_NAME = 'xcm-pdf-vault';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const SESSION_KEY = 'current';
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface VaultSession {
  filename: string;
  timestamp: number;
  pdfBytes: ArrayBuffer;
  annotations: Annotation[];
}

class SessionVault {
  private db: IDBDatabase | null = null;

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME);
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await this.openDB();
    }
    return this.db;
  }

  async save(
    filename: string,
    pdfBytes: ArrayBuffer,
    annotations: Annotation[]
  ): Promise<void> {
    try {
      const db = await this.getDB();
      const session: VaultSession = {
        filename,
        timestamp: Date.now(),
        pdfBytes,
        annotations: structuredClone(annotations),
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(session, SESSION_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Non-critical — swallow silently.
    }
  }

  async recover(): Promise<VaultSession | null> {
    try {
      const db = await this.getDB();

      const session = await new Promise<VaultSession | undefined>(
        (resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const req = tx.objectStore(STORE_NAME).get(SESSION_KEY);
          req.onsuccess = () => resolve(req.result as VaultSession | undefined);
          req.onerror = () => reject(req.error);
        }
      );

      if (!session) return null;

      const age = Date.now() - session.timestamp;
      if (age > MAX_SESSION_AGE_MS) {
        await this.clear();
        return null;
      }

      return session;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();

      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(SESSION_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Non-critical — swallow silently.
    }
  }
}

export const sessionVault = new SessionVault();
