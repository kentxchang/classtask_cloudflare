/** 模組：分類頁籤管理 */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { genId, nowStr, str } from '../lib/utils';
import { cleanupOrphans } from './files';

function categoryRowToObj(r: Row): Row {
  return { id: str(r.id), classId: str(r.class_id), name: str(r.name), order: Number(r.ord || 0), createdAt: str(r.created_at) };
}

export function listCategories(db: Db, classId: string): Row[] {
  return db.all('SELECT * FROM categories WHERE class_id = ? ORDER BY ord, rowid', classId).map(categoryRowToObj);
}

export const routes: Routes = {
  teacher: {
    getCategories(c: Ctx, classId: string): Result {
      return { success: true, data: listCategories(c.db, classId) };
    },

    createCategory(c: Ctx, classId: string, name: string): Result {
      const nm = str(name).trim();
      if (!nm) return { success: false, message: '分類名稱不可為空！' };
      const order = c.db.count('SELECT COUNT(*) AS c FROM categories WHERE class_id = ?', classId);
      const id = genId('CAT');
      c.db.run('INSERT INTO categories (id, class_id, name, ord, created_at) VALUES (?,?,?,?,?)', id, str(classId), nm, order, nowStr());
      return { success: true, message: '分類建立成功！', data: { id, classId: str(classId), name: nm, order } };
    },

    renameCategory(c: Ctx, categoryId: string, name: string): Result {
      if (!c.db.first('SELECT id FROM categories WHERE id = ?', categoryId)) return { success: false, message: '找不到分類！' };
      c.db.run('UPDATE categories SET name = ? WHERE id = ?', str(name), categoryId);
      return { success: true, message: '分類已更名！' };
    },

    // 與原版相同：刪除分類時一併刪除分類內的任務
    deleteCategory(c: Ctx, categoryId: string): Result {
      const cat = c.db.first('SELECT class_id FROM categories WHERE id = ?', categoryId);
      if (!cat) return { success: false, message: '找不到分類！' };
      c.db.run('DELETE FROM categories WHERE id = ?', categoryId);
      c.db.run('DELETE FROM tasks WHERE category_id = ?', categoryId);
      cleanupOrphans(c.db, cat.class_id);
      return { success: true, message: '分類已刪除（含分類內所有任務）。' };
    },

    reorderCategories(c: Ctx, orderedIds: string[]): Result {
      (orderedIds || []).forEach((id, idx) => c.db.run('UPDATE categories SET ord = ? WHERE id = ?', idx, id));
      return { success: true };
    }
  }
};
