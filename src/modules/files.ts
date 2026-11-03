/**
 * 模組：檔案（所有上傳圖片／PDF 頁面／分享檔案／Markdown／HTML 皆以 base64 文字存於資料庫）
 * - files：檔案資訊（所屬課程、檔名、類型、大小）
 * - file_chunks：base64 內容分段（SQLite 單欄位上限 2MB，每段 1MB 字元）
 */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { FILE_ID_RE, genFileId, parseJson, str } from '../lib/utils';

const CHUNK_CHARS = 1024 * 1024;
// 未被引用的檔案超過此時間才會被自動清除，避免剛上傳、尚未建立任務的檔案被誤刪
const ORPHAN_GRACE_MS = 60 * 60 * 1000;

// 把 data URL / base64 分段寫入資料庫，回傳檔案 ID
export function saveFile(db: Db, dataUrl: string, mime: string, name: string, classId: string, fixedId?: string): string {
  const raw = String(dataUrl || '');
  const m = raw.match(/^data:([^;,]+)?(;[^,]*)?,/);
  const base64 = m ? raw.slice(m[0].length) : raw;
  const mimeType = mime || (m && m[1]) || 'application/octet-stream';
  const id = fixedId || genFileId();
  const size = Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  db.tx(() => {
    db.run('DELETE FROM file_chunks WHERE file_id = ?', id);
    db.run('INSERT OR REPLACE INTO files (id, class_id, name, mime, size, created_at) VALUES (?,?,?,?,?,?)', id, classId || '', name || id, mimeType, size, Date.now());
    for (let i = 0, idx = 0; i < base64.length; i += CHUNK_CHARS, idx++) {
      db.run('INSERT INTO file_chunks (file_id, idx, data) VALUES (?,?,?)', id, idx, base64.slice(i, i + CHUNK_CHARS));
    }
  });
  return id;
}

export function readFileBase64(db: Db, id: string): { meta: Row; base64: string } | null {
  const meta = db.first('SELECT * FROM files WHERE id = ?', id);
  if (!meta) return null;
  const chunks = db.all('SELECT data FROM file_chunks WHERE file_id = ? ORDER BY idx', id);
  return { meta, base64: chunks.map(c => c.data).join('') };
}

export function deleteFiles(db: Db, ids: string[]) {
  ids.forEach(id => {
    db.run('DELETE FROM file_chunks WHERE file_id = ?', id);
    db.run('DELETE FROM files WHERE id = ?', id);
  });
}

// GET /f/<檔案ID>：以原始格式回傳檔案（?download=1 則強制下載）
export function serveFile(db: Db, id: string, download: boolean): Response {
  const f = readFileBase64(db, id);
  if (!f) return new Response('檔案不存在', { status: 404 });
  const bin = atob(f.base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const mime = str(f.meta.mime) || 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': mime,
    'Content-Disposition': (download ? 'attachment' : 'inline') + "; filename*=UTF-8''" + encodeURIComponent(str(f.meta.name)),
    // 檔案 ID 不會重複使用、內容不會變動，可長期快取
    'Cache-Control': 'public, max-age=31536000, immutable'
  };
  // 直接開啟上傳的 HTML／SVG 時，強制放進沙盒（獨立來源），避免其中的程式碼存取本站
  if (/html|svg|xml/i.test(mime)) headers['Content-Security-Policy'] = 'sandbox allow-scripts allow-popups allow-forms allow-modals';
  return new Response(bytes, { headers });
}

// 找出所有被任務設定或繳交內容引用的檔案 ID
export function referencedFileIds(db: Db): Set<string> {
  const set = new Set<string>();
  const collect = (s: any) => { (String(s || '').match(FILE_ID_RE) || []).forEach(x => set.add(x)); };
  db.all('SELECT config FROM tasks').forEach(r => collect(r.config));
  db.all('SELECT content FROM submissions').forEach(r => collect(r.content));
  return set;
}

// 刪除沒有被任何任務／繳交引用、且已超過保留時間的檔案（例如重新上傳 PDF 後的舊頁面）
export function cleanupOrphans(db: Db, classId?: string, ignoreGrace?: boolean): { count: number; bytes: number } {
  const refs = referencedFileIds(db);
  const limit = ignoreGrace ? Date.now() + 1 : Date.now() - ORPHAN_GRACE_MS;
  const rows = classId
    ? db.all('SELECT id, size FROM files WHERE class_id = ? AND created_at < ?', classId, limit)
    : db.all('SELECT id, size FROM files WHERE created_at < ?', limit);
  const orphans = rows.filter(r => !refs.has(r.id));
  deleteFiles(db, orphans.map(r => r.id));
  return { count: orphans.length, bytes: orphans.reduce((s, r) => s + Number(r.size || 0), 0) };
}

export const routes: Routes = {
  teacher: {
    uploadFile(c: Ctx, payload: any): Result {
      try {
        const id = saveFile(c.db, payload.base64Data, payload.mimeType, payload.fileName || ('file_' + Date.now()), payload.classId);
        return { success: true, fileId: id, fileName: payload.fileName || id };
      } catch (err: any) {
        return { success: false, message: '檔案上傳失敗：' + err };
      }
    },

    // 原本建立 Drive 資料夾；資料庫版本改為回傳一個虛擬資料夾 ID（記錄所屬課程）
    initPdfPageFolder(c: Ctx, title: string, classId: string): Result {
      return { success: true, folderId: JSON.stringify({ classId: classId || '', title: title || '' }) };
    },

    uploadPdfPage(c: Ctx, folderId: string, pageIndex: number, base64Data: string): Result {
      try {
        const info = parseJson(folderId, {});
        const id = saveFile(c.db, base64Data, 'image/jpeg', (info.title || 'PDF') + '_page_' + (Number(pageIndex) + 1) + '.jpg', info.classId || '');
        return { success: true, fileId: id, pageIndex: Number(pageIndex) };
      } catch (err: any) {
        return { success: false, message: '第 ' + (Number(pageIndex) + 1) + ' 頁上傳失敗：' + err };
      }
    },

    // 資料庫版本不存在 Drive 權限問題，保留函式以相容前端
    repairAllFileSharing(): Result {
      return { success: true, message: 'Cloudflare 資料庫版本的檔案皆可直接顯示，不需要修復權限。' };
    }
  },
  public: {
    getFileBase64(c: Ctx, fileId: string): Result {
      const f = readFileBase64(c.db, fileId);
      if (!f) return { success: false, message: '找不到檔案' };
      return { success: true, base64: 'data:' + f.meta.mime + ';base64,' + f.base64, fileName: f.meta.name };
    },

    getWebAppUrl(c: Ctx): string {
      return c.origin + '/';
    }
  }
};
