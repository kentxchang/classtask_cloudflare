/** 模組：PDF 電子書畫記筆記 */
import { Ctx, Result, Routes, Row } from '../lib/db';
import { nowStr, str } from '../lib/utils';

export const routes: Routes = {
  public: {
    saveAnnotation(c: Ctx, payload: any): Result {
      const noteId = payload.taskId + '_' + payload.studentId + '_' + payload.page;
      c.db.run('INSERT OR REPLACE INTO notes (id, task_id, student_id, page, data, updated_at) VALUES (?,?,?,?,?,?)',
        noteId, str(payload.taskId), str(payload.studentId), Number(payload.page), str(payload.dataJson), nowStr());
      return { success: true };
    },

    getAnnotations(c: Ctx, taskId: string, studentId: string): Result {
      const map: Row = {};
      c.db.all('SELECT page, data FROM notes WHERE task_id = ? AND student_id = ?', taskId, studentId).forEach(r => { map[Number(r.page)] = str(r.data); });
      return { success: true, data: map };
    }
  },
  teacher: {
    getAllAnnotationsForTask(c: Ctx, taskId: string): Result {
      const nameMap: Row = {};
      c.db.all('SELECT id, name FROM students').forEach(s => { nameMap[s.id] = s.name; });
      const byStudent: Row = {};
      c.db.all('SELECT student_id, page, data FROM notes WHERE task_id = ? ORDER BY rowid', taskId).forEach(r => {
        const sid = str(r.student_id);
        if (!byStudent[sid]) byStudent[sid] = { studentName: nameMap[sid] || sid, pages: {} };
        byStudent[sid].pages[Number(r.page)] = str(r.data);
      });
      return { success: true, data: byStudent };
    }
  }
};
