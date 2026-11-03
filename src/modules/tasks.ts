/**
 * 模組：互動任務管理
 * 新增任務類型時：在 TASK_TYPES 加入代號，並到 submissions.ts 的 SUBMIT_HANDLERS 定義學生提交方式。
 */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { genId, nowStr, parseJson, str } from '../lib/utils';
import { cleanupOrphans } from './files';

export const TASK_TYPES = [
  'LINK', 'PDF', 'FILE_SHARE', 'YOUTUBE', 'PHOTO_TEXT', 'DRAWING', 'QUIZ',
  'MARKDOWN',   // 分享 Markdown：學生看到排版後內容，可下載圖片／PDF
  'HTML_SHARE'  // 分享 HTML：學生瀏覽網頁並截圖回傳
];

export function taskRowToObj(r: Row): Row {
  return {
    id: str(r.id), classId: str(r.class_id), categoryId: str(r.category_id), type: str(r.type),
    title: str(r.title), description: str(r.description), config: parseJson(r.config, {}),
    order: Number(r.ord || 0), published: !!r.published, createdAt: str(r.created_at)
  };
}

export function listTasks(db: Db, classId: string): Row[] {
  return db.all('SELECT * FROM tasks WHERE class_id = ? ORDER BY ord, rowid', classId).map(taskRowToObj);
}

export function getTaskById(db: Db, taskId: string): Row | null {
  const r = db.first('SELECT * FROM tasks WHERE id = ?', taskId);
  return r ? taskRowToObj(r) : null;
}

export const routes: Routes = {
  teacher: {
    getTasks(c: Ctx, classId: string): Result {
      return { success: true, data: listTasks(c.db, classId) };
    },

    createTask(c: Ctx, payload: any): Result {
      if (TASK_TYPES.indexOf(payload.type) === -1) return { success: false, message: '未知的任務類型！' };
      const title = str(payload.title).trim();
      if (!title) return { success: false, message: '任務標題不可為空！' };
      const siblings = c.db.count('SELECT COUNT(*) AS c FROM tasks WHERE category_id = ?', str(payload.categoryId));
      const id = genId('TASK');
      c.db.run('INSERT INTO tasks (id, class_id, category_id, type, title, description, config, ord, published, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)',
        id, str(payload.classId), str(payload.categoryId), payload.type, title, str(payload.description), JSON.stringify(payload.config || {}), siblings, nowStr());
      return { success: true, message: '任務建立成功！', taskId: id };
    },

    updateTask(c: Ctx, taskId: string, fields: any): Result {
      const t = c.db.first('SELECT class_id FROM tasks WHERE id = ?', taskId);
      if (!t) return { success: false, message: '找不到任務！' };
      fields = fields || {};
      if (fields.title !== undefined) c.db.run('UPDATE tasks SET title = ? WHERE id = ?', str(fields.title), taskId);
      if (fields.description !== undefined) c.db.run('UPDATE tasks SET description = ? WHERE id = ?', str(fields.description), taskId);
      if (fields.config !== undefined) {
        c.db.run('UPDATE tasks SET config = ? WHERE id = ?', JSON.stringify(fields.config), taskId);
        cleanupOrphans(c.db, t.class_id);
      }
      return { success: true, message: '任務已更新！' };
    },

    toggleTaskPublish(c: Ctx, taskId: string, published: boolean): Result {
      if (!c.db.first('SELECT id FROM tasks WHERE id = ?', taskId)) return { success: false, message: '找不到任務！' };
      c.db.run('UPDATE tasks SET published = ? WHERE id = ?', published ? 1 : 0, taskId);
      return { success: true, message: published ? '任務已上架！' : '任務已下架！' };
    },

    deleteTask(c: Ctx, taskId: string): Result {
      const t = c.db.first('SELECT class_id FROM tasks WHERE id = ?', taskId);
      if (!t) return { success: false, message: '找不到任務！' };
      c.db.tx(() => {
        c.db.run('DELETE FROM gallery WHERE submission_id IN (SELECT id FROM submissions WHERE task_id = ?)', taskId);
        c.db.run('DELETE FROM tasks WHERE id = ?', taskId);
        c.db.run('DELETE FROM submissions WHERE task_id = ?', taskId);
        c.db.run('DELETE FROM questions WHERE task_id = ?', taskId);
        c.db.run('DELETE FROM notes WHERE task_id = ?', taskId);
      });
      cleanupOrphans(c.db, t.class_id);
      return { success: true, message: '任務已刪除！' };
    },

    reorderTasks(c: Ctx, orderedIds: string[]): Result {
      (orderedIds || []).forEach((id, idx) => c.db.run('UPDATE tasks SET ord = ? WHERE id = ?', idx, id));
      return { success: true };
    }
  }
};
