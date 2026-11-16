// "Bring your own runner": a photo becomes a rigged Gaussian-splat character through the public Viggle API.
// The player uses their OWN API key (https://portal.viggle.ai/keys). The key is sent only to apis.viggle.ai
// and lives only in this browser's localStorage. There is no server and no shared key in this project.
// Docs: https://docs.viggle.ai/v1/guides/quickstart-character-3d
const API = 'https://apis.viggle.ai/v1';
export const COST = 30; // credits for one type=vsplat character (1 credit = $0.01)
export const KEYS_URL = 'https://portal.viggle.ai/keys';
const KEY = 'maple.viggleKey', PENDING = 'maple.pendingChar';
const MOCK = new URLSearchParams(location.search).has('mockapi'); // UI testing without a key or credits

// The key lives in sessionStorage (gone when the tab closes) unless the player ticks "remember on this device".
export const getKey = () => sessionStorage.getItem(KEY) || localStorage.getItem(KEY) || '';
export const remembered = () => !!localStorage.getItem(KEY);
export function setKey(k, remember = false) {
  sessionStorage.removeItem(KEY); localStorage.removeItem(KEY);
  if (k) (remember ? localStorage : sessionStorage).setItem(KEY, k);
}
/** A character that was paid for but not downloaded yet: { id, at }. */
export const pending = () => { try { return JSON.parse(localStorage.getItem(PENDING)); } catch { return null; } };
export const discardPending = () => localStorage.removeItem(PENDING);

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function call(key, path, init = {}) {
  if (MOCK) return mock(path, init);
  let res;
  try { res = await fetch(API + path, { ...init, headers: { Authorization: `Bearer ${key}` } }); }
  catch { throw new ApiError(0, 'NETWORK', 'Could not reach the Viggle API. Check your connection and try again.'); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = body.error || {};
    throw new ApiError(res.status, e.code || '', res.status === 401 ? 'That API key was not accepted.'
      : res.status === 402 ? `Not enough credits. One runner costs ${COST}.`
        : e.message || `The Viggle API answered ${res.status}.`);
  }
  return body;
}

export const balance = (key) => call(key, '/credits').then((b) => b.balance);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll a character that is already being made, then download its .vsplat. Free to call again after a reload. */
export async function finish(key, id, onProgress = () => {}) {
  const t0 = Date.now();
  for (let misses = 0; ;) {
    let c;
    try { c = await call(key, `/characters/${id}`); misses = 0; }
    catch (e) { // a blip must not throw the player back to a paying button: keep polling
      if (e.status === 404) localStorage.removeItem(PENDING);
      if (!(e.status === 0 || e.status === 429 || e.status >= 500) || ++misses > 20) throw e;
      await sleep(Math.min(30e3, 2000 * misses)); continue;
    }
    const st = c.vsplat?.status || c.status;
    if (c.status === 'failed' || st === 'failed') {
      localStorage.removeItem(PENDING);
      throw new ApiError(200, 'FAILED', c.vsplat?.error?.message || c.error?.message || 'The character could not be made from this photo. Try a clear, full-body picture.');
    }
    if (c.status === 'ready' && (!c.vsplat || c.vsplat.status === 'ready')) break;
    onProgress({ stage: 'making', progress: c.progress || 0, secs: (Date.now() - t0) / 1000 });
    if (Date.now() - t0 > 15 * 60e3) throw new ApiError(0, 'TIMEOUT', 'Still working after 15 minutes. Reopen this panel later to pick it up; you will not be charged again.');
    await sleep(MOCK ? 700 : 3000);
  }
  onProgress({ stage: 'download', progress: 100 });
  const ex = await call(key, `/characters/${id}/export?download_type=vsplat`);
  if (!ex.vsplat_url) throw new ApiError(200, 'NO_FILE', 'The character is ready but its file is not available yet. Try again in a moment.');
  let blob;
  try { const r = await fetch(ex.vsplat_url); if (!r.ok) throw 0; blob = await r.blob(); }
  catch { throw new ApiError(0, 'DOWNLOAD', 'The character is ready but the download failed. Try again; you will not be charged again.'); }
  localStorage.removeItem(PENDING);
  return blob;
}

/** Upload a photo and make a character. Charges COST credits to the key's account. */
export async function create(key, file, onProgress = () => {}) {
  onProgress({ stage: 'upload', progress: 0 });
  const form = new FormData();
  form.append('image', file);
  form.append('type', 'vsplat');
  form.append('joint_set', 'full'); // the game's motion clips drive the full 441-joint rig
  form.append('name', 'Maple Run runner');
  let c;
  try { c = await call(key, '/characters', { method: 'POST', body: form }); }
  catch (e) { if (e.status === 0) e.message = 'The connection dropped while uploading. Check your credit balance before trying again: the request may have gone through.'; throw e; }
  try { localStorage.setItem(PENDING, JSON.stringify({ id: c.id, at: Date.now() })); } catch { /* storage blocked: still finish this session */ } // a reload resumes instead of paying twice
  return { id: c.id, blob: await finish(key, c.id, onProgress) };
}

// ---------------------------------------------------------------- local library (IndexedDB)
// The finished runner stays in this browser: { vsplat: Blob, photo: Blob, name }
function db() {
  return new Promise((ok, no) => {
    const r = indexedDB.open('maple-run', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('runner');
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
const tx = (mode, fn) => db().then((d) => new Promise((ok, no) => {
  const t = d.transaction('runner', mode), q = fn(t.objectStore('runner'));
  t.oncomplete = () => ok(q.result); t.onerror = t.onabort = () => no(t.error);
}));
// the photo of a job in flight, so a resumed job still gets its card picture
export const savePendingPhoto = (blob) => tx('readwrite', (s) => (blob ? s.put(blob, 'pendingPhoto') : s.delete('pendingPhoto'))).catch(() => {});
export const loadPendingPhoto = () => tx('readonly', (s) => s.get('pendingPhoto')).catch(() => null);
export const saveRunner = (rec) => tx('readwrite', (s) => s.put(rec, 'mine'));
export const loadRunner = () => tx('readonly', (s) => s.get('mine')).catch(() => null);
export const clearRunner = () => tx('readwrite', (s) => s.delete('mine'));

/** A small square-ish JPEG of the photo for the roster card. */
export async function thumbnail(file) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  } catch { return null; }
}

// ---------------------------------------------------------------- mock (?mockapi)
let mockPolls = 0;
async function mock(path, init) {
  await sleep(300);
  if (path === '/credits') return { balance: 100 };
  if (path === '/characters' && init.method === 'POST') { mockPolls = 0; return { id: 'char_mock', status: 'queued' }; }
  if (path.includes('/export')) return { vsplat_url: './characters/muse.vsplat' };
  mockPolls++;
  return { id: 'char_mock', status: mockPolls > 5 ? 'ready' : 'processing', progress: Math.min(100, mockPolls * 18), vsplat: { status: mockPolls > 5 ? 'ready' : 'processing' } };
}
