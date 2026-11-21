// データの保存先（IndexedDB、OV-04）。起動時に全部読み込み、以後は変わった行だけを書き込む
import { TABLES, memoryRepo } from './store.js';

const DB_NAME = 'coinflow';
const DB_VERSION = 1;
const STORES = [...TABLES, 'settings'];

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function readAll(db) {
  const tx = db.transaction(STORES);
  return Promise.all(STORES.map((name) => new Promise((resolve, reject) => {
    const req = tx.objectStore(name).getAll();
    req.onsuccess = () => resolve([name, req.result]);
    req.onerror = () => reject(req.error);
  }))).then(Object.fromEntries);
}

// IndexedDB が使えない環境ではメモリだけで動く
export async function loadRepo() {
  const repo = memoryRepo();
  let db = null;
  try {
    db = await openDb();
    repo.tables = await readAll(db);
  } catch {
    db = null;
  }
  if (db) {
    repo.write = (ops) => {
      const fail = (e) => {
        console.error('save failed', e);
        repo.onError?.(e);
      };
      try {
        const tx = db.transaction([...new Set(ops.map((o) => o.table))], 'readwrite');
        tx.onerror = () => fail(tx.error);
        tx.onabort = () => fail(tx.error);
        for (const op of ops) {
          const os = tx.objectStore(op.table);
          if (op.type === 'put') os.put(op.row);
          else if (op.type === 'delete') os.delete(op.id);
          else os.clear();
        }
      } catch (e) {
        fail(e);
      }
    };
  }
  return repo;
}
