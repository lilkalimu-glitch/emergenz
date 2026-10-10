// Speichern auf dem Gerät (IndexedDB). Ein Speicherplatz für die aktuelle Welt.

const DB = 'emergenz';
const STORE = 'welten';
const KEY = 'aktuell';

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Kein Speicher verfügbar'));
      return;
    }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const st = tx.objectStore(STORE);
    const req = fn(st);
    tx.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function save(data) {
  return run('readwrite', (st) => st.put(data, KEY));
}

export async function load() {
  try {
    return await run('readonly', (st) => st.get(KEY));
  } catch {
    return null;
  }
}

export async function clear() {
  return run('readwrite', (st) => st.delete(KEY));
}
