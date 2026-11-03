/** 模組：課堂管理（建立／設定／加入代碼／刪除） */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { genId, nowStr, str } from '../lib/utils';

export function classRowToObj(r: Row): Row {
  return {
    id: str(r.id), name: str(r.name), subject: str(r.subject), joinCode: str(r.join_code),
    galleryEnabled: !!r.gallery_enabled, peerInteractionEnabled: !!r.peer_enabled, createdAt: str(r.created_at)
  };
}

// 與原本相同：新建立的課堂排在最前面
export function listClasses(db: Db): Row[] {
  return db.all('SELECT * FROM classes ORDER BY rowid DESC').map(classRowToObj);
}

export function getClassObj(db: Db, classId: string): Row | null {
  const r = db.first('SELECT * FROM classes WHERE id = ?', classId);
  return r ? classRowToObj(r) : null;
}

// 預設自動產生 4 位數字（例如 0428），不與其他課堂重複
export function generateJoinCode(db: Db): string {
  const existing = new Set(db.all('SELECT join_code FROM classes').map(r => str(r.join_code)));
  let code;
  do { code = String(Math.floor(Math.random() * 10000)).padStart(4, '0'); } while (existing.has(code));
  return code;
}

// 刪除課堂及其所有關聯資料（含此課堂上傳的所有檔案）
export function removeClassData(db: Db, classId: string) {
  db.tx(() => {
    db.run('DELETE FROM questions WHERE task_id IN (SELECT id FROM tasks WHERE class_id = ?)', classId);
    db.run('DELETE FROM notes WHERE task_id IN (SELECT id FROM tasks WHERE class_id = ?)', classId);
    db.run('DELETE FROM gallery WHERE submission_id IN (SELECT id FROM submissions WHERE class_id = ?)', classId);
    db.run('DELETE FROM classes WHERE id = ?', classId);
    db.run('DELETE FROM categories WHERE class_id = ?', classId);
    db.run('DELETE FROM tasks WHERE class_id = ?', classId);
    db.run('DELETE FROM enrollments WHERE class_id = ?', classId);
    db.run('DELETE FROM submissions WHERE class_id = ?', classId);
    db.run('DELETE FROM file_chunks WHERE file_id IN (SELECT id FROM files WHERE class_id = ?)', classId);
    db.run('DELETE FROM files WHERE class_id = ?', classId);
  });
}

export const routes: Routes = {
  teacher: {
    updateClassJoinCode(c: Ctx, classId: string, newCode: string): Result {
      const code = str(newCode).trim().toUpperCase();
      if (!/^[A-Z0-9]{4}$/.test(code)) return { success: false, message: '課堂代碼須為 4 碼英數字組合！' };
      if (!getClassObj(c.db, classId)) return { success: false, message: '找不到課堂！' };
      if (c.db.first('SELECT id FROM classes WHERE id <> ? AND UPPER(join_code) = ?', classId, code)) {
        return { success: false, message: `課堂代碼《${code}》已被其他課堂使用，請換一組！` };
      }
      c.db.run('UPDATE classes SET join_code = ? WHERE id = ?', code, classId);
      return { success: true, message: '課堂代碼已更新！', joinCode: code };
    },

    createClass(c: Ctx, payload: any): Result {
      const name = str(payload && payload.name).trim();
      if (!name) return { success: false, message: '課堂名稱不可為空！' };
      const classId = genId('CLS');
      const joinCode = generateJoinCode(c.db);
      c.db.run('INSERT INTO classes (id, name, subject, join_code, gallery_enabled, peer_enabled, created_at) VALUES (?,?,?,?,1,1,?)', classId, name, str(payload.subject), joinCode, nowStr());
      return { success: true, message: '課堂建立成功！', classId, joinCode };
    },

    getClasses(c: Ctx): Result {
      return { success: true, data: listClasses(c.db) };
    },

    getClassById(c: Ctx, classId: string): Result {
      const cls = getClassObj(c.db, classId);
      return cls ? { success: true, data: cls } : { success: false, message: '找不到課堂！' };
    },

    updateClass(c: Ctx, classId: string, fields: any): Result {
      if (!getClassObj(c.db, classId)) return { success: false, message: '找不到課堂！' };
      fields = fields || {};
      if (fields.name !== undefined) c.db.run('UPDATE classes SET name = ? WHERE id = ?', str(fields.name), classId);
      if (fields.subject !== undefined) c.db.run('UPDATE classes SET subject = ? WHERE id = ?', str(fields.subject), classId);
      if (fields.galleryEnabled !== undefined) c.db.run('UPDATE classes SET gallery_enabled = ? WHERE id = ?', fields.galleryEnabled ? 1 : 0, classId);
      if (fields.peerInteractionEnabled !== undefined) c.db.run('UPDATE classes SET peer_enabled = ? WHERE id = ?', fields.peerInteractionEnabled ? 1 : 0, classId);
      return { success: true, message: '課堂設定已更新！' };
    },

    deleteClass(c: Ctx, classId: string): Result {
      if (!getClassObj(c.db, classId)) return { success: false, message: '找不到課堂！' };
      removeClassData(c.db, classId);
      return { success: true, message: '課堂已刪除（含所屬分類、任務、學生名單指派與繳交紀錄；學生總名單本身不受影響）。' };
    }
  }
};
