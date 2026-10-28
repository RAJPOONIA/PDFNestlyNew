/**
 * PDFNestly Shared Document Store
 * Uses native IndexedDB to store binary PDF buffers (supporting up to 100+ MB)
 * seamlessly across the Homepage, PDF Editor Studio, and all 30 PDF Tools.
 * No Base64 expansion, no 5MB sessionStorage quota issues.
 */

const DB_NAME = 'pdfnestly_docs_v1';
const DB_VERSION = 1;
const STORE_NAME = 'active_document';
const CURRENT_DOC_KEY = 'current_active_pdf';

export interface StoredDocument {
  id: string;
  name: string;
  bytes: Uint8Array;
  size: number;
  updatedAt: number;
  source?: string;
}

// In-memory fallback if IndexedDB is unavailable (e.g. strict private mode or SSR)
let memoryFallback: StoredDocument | null = null;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available in this environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

/**
 * Stores a PDF document (File or Uint8Array) in IndexedDB.
 */
export async function storeCurrentDocument(
  input: File | { name: string; bytes: Uint8Array },
  source: string = 'upload'
): Promise<StoredDocument> {
  let name = 'document.pdf';
  let bytes: Uint8Array;

  if (input instanceof File) {
    name = input.name;
    const arrayBuffer = await input.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
  } else {
    name = input.name || 'document.pdf';
    bytes = input.bytes;
  }

  const docRecord: StoredDocument = {
    id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    bytes,
    size: bytes.byteLength,
    updatedAt: Date.now(),
    source,
  };

  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Store ArrayBuffer in IndexedDB (native binary support without base64 overhead)
      const req = store.put({
        key: CURRENT_DOC_KEY,
        id: docRecord.id,
        name: docRecord.name,
        buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        size: docRecord.size,
        updatedAt: docRecord.updatedAt,
        source: docRecord.source,
      });

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Also update memory fallback
    memoryFallback = docRecord;

    // Notify all listeners on current page
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('pdfnestly:document-updated', {
          detail: { id: docRecord.id, name: docRecord.name, size: docRecord.size },
        })
      );
    }

    return docRecord;
  } catch (err) {
    console.warn('IndexedDB write failed; using memory store fallback:', err);
    memoryFallback = docRecord;
    return docRecord;
  }
}

/**
 * Retrieves the currently active PDF document from IndexedDB or memory.
 */
export async function loadCurrentDocument(): Promise<StoredDocument | null> {
  try {
    const db = await openDatabase();
    return await new Promise<StoredDocument | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(CURRENT_DOC_KEY);

      req.onsuccess = () => {
        const result = req.result;
        if (!result || !result.buffer) {
          resolve(memoryFallback);
          return;
        }

        const bytes = new Uint8Array(result.buffer);
        const doc: StoredDocument = {
          id: result.id,
          name: result.name,
          bytes,
          size: result.size || bytes.byteLength,
          updatedAt: result.updatedAt || Date.now(),
          source: result.source,
        };
        memoryFallback = doc;
        resolve(doc);
      };

      req.onerror = () => {
        resolve(memoryFallback);
      };
    });
  } catch {
    return memoryFallback;
  }
}

/**
 * Clears the currently active PDF from IndexedDB.
 */
export async function clearCurrentDocument(): Promise<void> {
  memoryFallback = null;
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(CURRENT_DOC_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pdfnestly:document-cleared'));
    }
  } catch (err) {
    console.warn('Failed to clear IndexedDB:', err);
  }
}

/**
 * Checks whether an active document currently exists in storage.
 */
export async function hasCurrentDocument(): Promise<boolean> {
  const doc = await loadCurrentDocument();
  return Boolean(doc && doc.bytes && doc.bytes.length > 0);
}
