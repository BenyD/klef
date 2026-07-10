// Persist the unlocked DEK across reloads so the vault doesn't re-prompt on
// every refresh. The DEK is a NON-EXTRACTABLE AES-GCM CryptoKey (see
// shared/crypto.ts): IndexedDB can structured-clone the key object, keeping it
// usable for decrypt while its raw bytes stay unreadable by any script. Scoped
// to the owning user id so a different account never restores someone else's
// key. Cleared on explicit lock and on sign-out.

const DB_NAME = "klef";
const STORE = "session";
const KEY = "dek";

interface StoredDek {
  userId: string;
  dek: CryptoKey;
  /** Freshness stamp; refreshed while the vault stays unlocked (touchDek). */
  savedAt?: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = run(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Remember the unlocked DEK for this user. Best-effort; failures are ignored. */
export async function saveDek(userId: string, dek: CryptoKey): Promise<void> {
  try {
    await withStore("readwrite", (s) =>
      s.put({ userId, dek, savedAt: Date.now() } satisfies StoredDek, KEY),
    );
  } catch {
    // IndexedDB may be unavailable (private mode, disabled) — fall back to
    // prompting for the passphrase, which still works.
  }
}

/** Refresh the freshness stamp so an active session isn't aged out. */
export async function touchDek(userId: string): Promise<void> {
  try {
    const rec = await withStore<StoredDek | undefined>("readonly", (s) =>
      s.get(KEY),
    );
    if (rec?.userId === userId) {
      await withStore("readwrite", (s) =>
        s.put({ ...rec, savedAt: Date.now() } satisfies StoredDek, KEY),
      );
    }
  } catch {
    // best-effort
  }
}

/**
 * Restore the DEK iff one is stored for this exact user and is no older than
 * maxAgeMs (aligning "remembered across reloads" with the auto-lock window).
 * A record for a different user or past its age is evicted, not just skipped.
 */
export async function loadDek(
  userId: string,
  maxAgeMs = Infinity,
): Promise<CryptoKey | null> {
  try {
    const rec = await withStore<StoredDek | undefined>("readonly", (s) =>
      s.get(KEY),
    );
    if (!rec) return null;
    const fresh = Date.now() - (rec.savedAt ?? 0) <= maxAgeMs;
    if (rec.userId === userId && rec.dek instanceof CryptoKey && fresh) {
      return rec.dek;
    }
    await clearDek();
  } catch {
    // ignore and require a passphrase
  }
  return null;
}

/** Forget the persisted DEK (on lock or sign-out). */
export async function clearDek(): Promise<void> {
  try {
    await withStore("readwrite", (s) => s.delete(KEY));
  } catch {
    // ignore
  }
}
