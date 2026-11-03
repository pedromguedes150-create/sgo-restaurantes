/**
 * RASCUNHO LOCAL (v1.181.1) — o que o gerente já digitou sobrevive à volta da câmera.
 *
 * No Android, abrir a câmera pelo campo de arquivo manda o navegador para
 * segundo plano; com pouca memória o Chrome DESCARTA a aba e, ao voltar,
 * recarrega a página — e todo estado do React some (relato: "depois da foto
 * os lançamentos saem da tela"). Não há como impedir o descarte; o que dá
 * para fazer é guardar o rascunho fora do React e recuperá-lo ao montar.
 *
 * - Campos de texto: `localStorage` (JSON). `sessionStorage` nem sempre volta
 *   com a aba descartada; `localStorage` sim.
 * - A FOTO (um `File`): IndexedDB, que aceita Blob. `localStorage` não.
 * Toda leitura/escrita é em try/catch: sem armazenamento (modo privado,
 * dados bloqueados) a tela segue funcionando como antes, só sem a rede de
 * segurança.
 */

const PREFIXO = 'sgo-rascunho:';
const DB = 'sgo-rascunhos';
const STORE = 'fotos';

export function lerRascunho<T>(chave: string): T | null {
  try {
    const raw = window.localStorage.getItem(PREFIXO + chave);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
export function gravarRascunho<T>(chave: string, valor: T): void {
  try { window.localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)); } catch { /* sem armazenamento: segue sem rascunho */ }
}
export function apagarRascunho(chave: string): void {
  try { window.localStorage.removeItem(PREFIXO + chave); } catch { /* idem */ }
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('sem IndexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function transacao<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  }));
}

/** Guarda a foto tirada (Blob) para sobreviver ao recarregamento. Falha calada. */
export async function guardarFotoLocal(chave: string, foto: File): Promise<void> {
  try { await transacao('readwrite', (s) => s.put({ blob: foto, name: foto.name, type: foto.type, em: Date.now() }, chave)); } catch { /* sem IndexedDB */ }
}
export async function lerFotoLocal(chave: string): Promise<File | null> {
  try {
    const r = await transacao<{ blob: Blob; name: string; type: string } | undefined>('readonly', (s) => s.get(chave));
    return r?.blob ? new File([r.blob], r.name || 'foto.jpg', { type: r.type || r.blob.type }) : null;
  } catch { return null; }
}
export async function apagarFotoLocal(chave: string): Promise<void> {
  try { await transacao('readwrite', (s) => s.delete(chave)); } catch { /* idem */ }
}
