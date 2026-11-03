/** 模組：學生帳號（全校通用學生總名單）與課堂名單指派 */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { genId, nowStr, parseCsvLine, str, zhSort } from '../lib/utils';
import { getSetting, setSetting } from './auth';
import { classRowToObj } from './classes';

function studentRowToObj(r: Row): Row {
  return { id: str(r.id), name: str(r.name), account: str(r.account), password: str(r.password), createdAt: str(r.created_at) };
}

export function listStudents(db: Db): Row[] {
  return db.all('SELECT * FROM students ORDER BY rowid').map(studentRowToObj).sort((a, b) => zhSort(a.name, b.name));
}

function isNoPasswordEnabled(db: Db): boolean {
  return getSetting(db, 'studentNoPassword') === 'true';
}

function enrolledIds(db: Db, classId: string): string[] {
  return db.all('SELECT student_id FROM enrollments WHERE class_id = ? ORDER BY rowid', classId).map(r => str(r.student_id));
}

export function enrolledStudents(db: Db, classId: string): Row[] {
  const idSet = new Set(enrolledIds(db, classId));
  return listStudents(db).filter(s => idSet.has(s.id));
}

export function classesForStudent(db: Db, studentId: string): Row[] {
  const idSet = new Set(db.all('SELECT class_id FROM enrollments WHERE student_id = ?', studentId).map(r => str(r.class_id)));
  return db.all('SELECT * FROM classes ORDER BY rowid').map(classRowToObj).filter(c => idSet.has(c.id));
}

const INSERT_STU = 'INSERT INTO students (id, name, account, password, created_at) VALUES (?,?,?,?,?)';

export const routes: Routes = {
  teacher: {
    getAllStudents(c: Ctx): Result {
      return { success: true, data: listStudents(c.db) };
    },

    getStudentLoginSettings(c: Ctx): Result {
      return { success: true, noPassword: isNoPasswordEnabled(c.db) };
    },

    setStudentLoginSettings(c: Ctx, noPassword: any): Result {
      const val = noPassword === true || String(noPassword).toLowerCase() === 'true';
      setSetting(c.db, 'studentNoPassword', val ? 'true' : 'false');
      return { success: true, noPassword: val, message: val ? '設定成功！學生已可不用密碼直接登入。' : '設定成功！已改為學生需輸入密碼登入。' };
    },

    createStudent(c: Ctx, name: string, password: string): Result {
      const nm = str(name).trim();
      const pwd = str(password).trim();
      if (!nm || !pwd) return { success: false, message: '姓名與密碼皆為必填！' };
      if (c.db.first('SELECT id FROM students WHERE name = ?', nm)) return { success: false, message: `學生《${nm}》已存在於學生總名單中！` };
      c.db.run(INSERT_STU, genId('STU'), nm, nm, pwd, nowStr());
      return { success: true, message: `學生《${nm}》新增成功！` };
    },

    // 批次新增：每行「姓名,密碼」
    batchCreateStudents(c: Ctx, text: string): Result {
      const existingNames = new Set(c.db.all('SELECT name FROM students').map(r => str(r.name)));
      const lines = str(text).split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
      let added = 0, skipped = 0;
      c.db.tx(() => {
        lines.forEach(line => {
          const cols = parseCsvLine(line);
          const nm = str(cols[0]).trim();
          const pwd = str(cols[1]).trim();
          if (nm && pwd && !existingNames.has(nm)) {
            existingNames.add(nm);
            c.db.run(INSERT_STU, genId('STU') + '_' + added, nm, nm, pwd, nowStr());
            added++;
          } else {
            skipped++;
          }
        });
      });
      return { success: true, message: `批次新增完成：成功 ${added} 位，略過重複 ${skipped} 位。` };
    },

    resetStudentPassword(c: Ctx, studentId: string, newPassword: string): Result {
      if (!c.db.first('SELECT id FROM students WHERE id = ?', studentId)) return { success: false, message: '找不到學生！' };
      c.db.run('UPDATE students SET password = ? WHERE id = ?', str(newPassword).trim(), studentId);
      return { success: true, message: '密碼已重設！' };
    },

    deleteStudent(c: Ctx, studentId: string): Result {
      if (!c.db.first('SELECT id FROM students WHERE id = ?', studentId)) return { success: false, message: '找不到學生！' };
      c.db.run('DELETE FROM students WHERE id = ?', studentId);
      c.db.run('DELETE FROM enrollments WHERE student_id = ?', studentId);
      return { success: true, message: '學生已刪除（並移除其所有課堂的名單資格）！' };
    },

    // 覆蓋式設定某課堂的完整學生名單
    setClassEnrollment(c: Ctx, classId: string, studentIds: string[]): Result {
      const ids = Array.isArray(studentIds) ? studentIds : [];
      c.db.tx(() => {
        c.db.run('DELETE FROM enrollments WHERE class_id = ?', classId);
        ids.forEach((sid, i) => c.db.run('INSERT INTO enrollments (id, class_id, student_id, joined_at) VALUES (?,?,?,?)', genId('ENR') + '_' + i, classId, sid, nowStr()));
      });
      return { success: true, message: `已更新課堂名單，共 ${ids.length} 位學生。` };
    },

    getEnrolledStudentIds(c: Ctx, classId: string): Result {
      return { success: true, data: enrolledIds(c.db, classId) };
    },

    getEnrolledStudents(c: Ctx, classId: string): Result {
      return { success: true, data: enrolledStudents(c.db, classId) };
    }
  },
  public: {
    // 學生登入畫面用的公開名單（不含密碼）
    getStudentRoster(c: Ctx): Result {
      return { success: true, data: listStudents(c.db).map(s => ({ id: s.id, name: s.name })), noPassword: isNoPasswordEnabled(c.db) };
    },

    loginStudent(c: Ctx, studentId: string, password: string): Result {
      const r = c.db.first('SELECT * FROM students WHERE id = ?', studentId);
      if (!r) return { success: false, message: '找不到學生帳號！' };
      if (isNoPasswordEnabled(c.db) || str(r.password).trim() === str(password).trim()) {
        return { success: true, message: '登入成功！', data: { id: str(r.id), name: str(r.name) } };
      }
      return { success: false, message: '密碼不正確！' };
    },

    getClassesForStudent(c: Ctx, studentId: string): Result {
      return { success: true, data: classesForStudent(c.db, studentId) };
    }
  }
};
