/**
 * 模組：空間管理（各課程佔用空間統計／備份匯出／刪除／匯入還原／清理未使用檔案）
 * 備份與匯入都拆成「文字資料」與「逐一檔案」兩段，避免單次請求過大。
 */
import { Ctx, Result, Routes, Row } from '../lib/db';
import { str } from '../lib/utils';
import { cleanupOrphans, readFileBase64, referencedFileIds, saveFile } from './files';
import { generateJoinCode, listClasses, removeClassData } from './classes';

const DB_LIMIT_BYTES = 1024 * 1024 * 1024; // 以 1GB 作為可視化上限
const BACKUP_FORMAT = 'classroom-task-backup';

export const routes: Routes = {
  teacher: {
    // 計算每個課程佔用的位元組數（文字資料與檔案分開統計）
    getStorageStats(c: Ctx): Result {
      const db = c.db;
      const B = (col: string) => `COALESCE(length(CAST(${col} AS BLOB)),0)`;
      const stats: Row = {};
      const ensure = (cid: string) => (stats[cid] = stats[cid] || { dataBytes: 0, fileBytes: 0, fileCount: 0 });
      const add = (rows: Row[]) => rows.forEach(r => { ensure(str(r.cid)).dataBytes += Number(r.b || 0); });

      add(db.all(`SELECT id AS cid, SUM(${B('id')}+${B('name')}+${B('subject')}+${B('join_code')}+${B('created_at')}) AS b FROM classes GROUP BY id`));
      add(db.all(`SELECT class_id AS cid, SUM(${B('id')}+${B('name')}+${B('created_at')}) AS b FROM categories GROUP BY class_id`));
      add(db.all(`SELECT class_id AS cid, SUM(${B('id')}+${B('title')}+${B('description')}+${B('config')}+${B('created_at')}) AS b FROM tasks GROUP BY class_id`));
      add(db.all(`SELECT class_id AS cid, SUM(${B('id')}+${B('student_id')}+${B('joined_at')}) AS b FROM enrollments GROUP BY class_id`));
      add(db.all(`SELECT class_id AS cid, SUM(${B('id')}+${B('task_id')}+${B('student_name')}+${B('content')}+${B('comment')}+${B('submitted_at')}+${B('graded_at')}) AS b FROM submissions GROUP BY class_id`));
      add(db.all(`SELECT t.class_id AS cid, SUM(${B('q.id')}+${B('q.text')}+${B('q.opt_a')}+${B('q.opt_b')}+${B('q.opt_c')}+${B('q.opt_d')}+${B('q.explanation')}) AS b FROM questions q JOIN tasks t ON t.id = q.task_id GROUP BY t.class_id`));
      add(db.all(`SELECT t.class_id AS cid, SUM(${B('n.id')}+${B('n.data')}) AS b FROM notes n JOIN tasks t ON t.id = n.task_id GROUP BY t.class_id`));
      add(db.all(`SELECT s.class_id AS cid, SUM(${B('g.id')}+${B('g.student_name')}+${B('g.content')}) AS b FROM gallery g JOIN submissions s ON s.id = g.submission_id GROUP BY s.class_id`));
      // 檔案以實際存放的 base64 字元數計算
      db.all(`SELECT f.class_id AS cid, COUNT(DISTINCT f.id) AS c, SUM(length(fc.data)) AS b FROM files f JOIN file_chunks fc ON fc.file_id = f.id GROUP BY f.class_id`).forEach(r => {
        const s = ensure(str(r.cid)); s.fileBytes += Number(r.b || 0); s.fileCount += Number(r.c || 0);
      });

      const all = listClasses(db);
      const names: Row = {};
      all.forEach(cls => { names[cls.id] = cls; });
      all.forEach(cls => ensure(cls.id));
      const classes = Object.keys(stats).map(cid => ({
        classId: cid,
        name: names[cid] ? names[cid].name : (cid ? '（已不存在的課程）' : '（未歸屬課程）'),
        subject: names[cid] ? names[cid].subject : '',
        exists: !!names[cid],
        dataBytes: stats[cid].dataBytes, fileBytes: stats[cid].fileBytes, fileCount: stats[cid].fileCount,
        totalBytes: stats[cid].dataBytes + stats[cid].fileBytes
      })).sort((a, b) => b.totalBytes - a.totalBytes);

      const refs = referencedFileIds(db);
      const orphanRows = db.all('SELECT id, size FROM files').filter(r => !refs.has(r.id));
      return {
        success: true,
        limitBytes: DB_LIMIT_BYTES,
        databaseBytes: db.databaseSize,
        orphanCount: orphanRows.length,
        orphanBytes: orphanRows.reduce((s, r) => s + Number(r.size || 0), 0),
        classes
      };
    },

    // 備份第一步：課程所有文字資料（不含檔案內容）＋檔案清單
    // 注意：SQLite 每次查詢的繫結參數有上限，因此一律用 JOIN／子查詢，不組長串 IN (?,?,...)
    exportClassMeta(c: Ctx, classId: string): Result {
      const db = c.db;
      const cls = db.first('SELECT * FROM classes WHERE id = ?', classId);
      if (!cls) return { success: false, message: '找不到課堂！' };
      return {
        success: true,
        data: {
          format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(),
          class: cls,
          categories: db.all('SELECT * FROM categories WHERE class_id = ? ORDER BY rowid', classId),
          tasks: db.all('SELECT * FROM tasks WHERE class_id = ? ORDER BY rowid', classId),
          questions: db.all('SELECT q.* FROM questions q JOIN tasks t ON t.id = q.task_id WHERE t.class_id = ? ORDER BY q.rowid', classId),
          notes: db.all('SELECT n.* FROM notes n JOIN tasks t ON t.id = n.task_id WHERE t.class_id = ? ORDER BY n.rowid', classId),
          enrollments: db.all('SELECT * FROM enrollments WHERE class_id = ? ORDER BY rowid', classId),
          students: db.all('SELECT * FROM students WHERE id IN (SELECT student_id FROM enrollments WHERE class_id = ? UNION SELECT student_id FROM submissions WHERE class_id = ?) ORDER BY rowid', classId, classId),
          submissions: db.all('SELECT * FROM submissions WHERE class_id = ? ORDER BY rowid', classId),
          gallery: db.all('SELECT g.* FROM gallery g JOIN submissions s ON s.id = g.submission_id WHERE s.class_id = ? ORDER BY g.rowid', classId),
          fileList: db.all('SELECT id, name, mime, size FROM files WHERE class_id = ? ORDER BY rowid', classId)
        }
      };
    },

    // 備份第二步：逐一取得檔案的 base64 內容
    exportFile(c: Ctx, fileId: string): Result {
      const f = readFileBase64(c.db, fileId);
      if (!f) return { success: false, message: '找不到檔案：' + fileId };
      return { success: true, data: { id: f.meta.id, class_id: f.meta.class_id, name: f.meta.name, mime: f.meta.mime, size: f.meta.size, created_at: f.meta.created_at, data: f.base64 } };
    },

    // 刪除課程（含所有資料與檔案）；也可清除「已不存在的課程」殘留的資料
    deleteClassWithFiles(c: Ctx, classId: string): Result {
      if (!classId) return { success: false, message: '未指定課程！' };
      removeClassData(c.db, classId);
      return { success: true, message: '課程與其所有資料、檔案已刪除。' };
    },

    cleanupOrphanFiles(c: Ctx): Result {
      const r = cleanupOrphans(c.db, undefined, true);
      return { success: true, message: `已清除 ${r.count} 個未被使用的檔案，釋放約 ${(r.bytes / 1024 / 1024).toFixed(2)} MB。` };
    },

    // 匯入第一步：還原課程文字資料（課程仍存在時拒絕；加入代碼重複時自動換新；學生自動對應）
    importClassMeta(c: Ctx, backup: any): Result {
      const db = c.db;
      if (!backup || backup.format !== BACKUP_FORMAT || !backup.class) return { success: false, message: '備份檔格式不正確！' };
      const cls = backup.class;
      if (db.first('SELECT id FROM classes WHERE id = ?', cls.id)) return { success: false, message: `課程《${cls.name}》目前仍存在，請先刪除後再匯入。` };

      let joinCode = str(cls.join_code);
      let joinCodeChanged = false;
      if (!joinCode || db.first('SELECT id FROM classes WHERE UPPER(join_code) = ?', joinCode.toUpperCase())) {
        joinCode = generateJoinCode(db);
        joinCodeChanged = true;
      }

      const studentMap: Row = {};
      let newStudents = 0;
      const insertRow = (table: string, row: Row) => {
        const cols = Object.keys(row).filter(col => /^[a-z_]+$/.test(col));
        db.run(`INSERT OR REPLACE INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, ...cols.map(col => row[col]));
      };
      const mapSid = (sid: string) => studentMap[sid] || sid;
      const remapId = (s: string) => {
        let out = str(s);
        Object.keys(studentMap).forEach(oldId => { if (studentMap[oldId] !== oldId) out = out.split(oldId).join(studentMap[oldId]); });
        return out;
      };

      db.tx(() => {
        // 學生：同 ID 已存在則沿用；同名不同 ID 則對應到現有學生；否則新增
        (backup.students || []).forEach((s: Row) => {
          if (db.first('SELECT id FROM students WHERE id = ?', s.id)) { studentMap[s.id] = s.id; return; }
          const sameName = db.first('SELECT id FROM students WHERE name = ?', s.name);
          if (sameName) { studentMap[s.id] = sameName.id; return; }
          insertRow('students', s); studentMap[s.id] = s.id; newStudents++;
        });
        insertRow('classes', Object.assign({}, cls, { join_code: joinCode }));
        (backup.categories || []).forEach((r: Row) => insertRow('categories', r));
        (backup.tasks || []).forEach((r: Row) => insertRow('tasks', r));
        (backup.questions || []).forEach((r: Row) => insertRow('questions', r));
        (backup.notes || []).forEach((r: Row) => insertRow('notes', Object.assign({}, r, { id: remapId(r.id), student_id: mapSid(r.student_id) })));
        (backup.enrollments || []).forEach((r: Row) => insertRow('enrollments', Object.assign({}, r, { student_id: mapSid(r.student_id) })));
        (backup.submissions || []).forEach((r: Row) => insertRow('submissions', Object.assign({}, r, { student_id: mapSid(r.student_id) })));
        (backup.gallery || []).forEach((r: Row) => insertRow('gallery', Object.assign({}, r, { student_id: mapSid(r.student_id) })));
      });
      return {
        success: true,
        message: `課程《${cls.name}》資料已匯入` + (newStudents ? `，新增 ${newStudents} 位學生` : '') + (joinCodeChanged ? `，原加入代碼重複，已改為 ${joinCode}` : '') + '。'
      };
    },

    // 匯入第二步：逐一寫回檔案（沿用原檔案 ID，任務與繳交內容中的引用即可直接對應）
    importFile(c: Ctx, file: any): Result {
      if (!file || !/^F_[0-9a-f]{32}$/.test(str(file.id))) return { success: false, message: '檔案資料不正確' };
      saveFile(c.db, file.data, file.mime, file.name, file.class_id, file.id);
      return { success: true };
    }
  }
};
