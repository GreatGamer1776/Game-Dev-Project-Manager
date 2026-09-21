// FileSystemDirectoryHandle objects are browser security tokens — they can only
// be persisted via structured clone in IndexedDB and cannot be serialized to the
// server database. This store exists solely to remember linked local-folder
// handles across sessions; all project data lives in the backend API.
const DB_NAME = 'devarchitect_handles';
const STORE = 'handles';

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> => {
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve) => {
      const tx = db.transaction([STORE], mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const handleStore = {
  save: (id: string, handle: FileSystemDirectoryHandle) =>
    withStore('readwrite', (store) => store.put(handle, id)),
  load: (id: string) =>
    withStore<FileSystemDirectoryHandle>('readonly', (store) => store.get(id)),
  delete: (id: string) =>
    withStore('readwrite', (store) => store.delete(id)),
};
