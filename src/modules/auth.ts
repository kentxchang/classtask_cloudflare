/**
 * 模組：系統設定與教師登入
 * 教師登入成功後發給一組憑證（token），前端呼叫教師專用 API 時放在 X-Teacher-Token 標頭。
 */
import { Ctx, Db, Result, Routes } from '../lib/db';
import { str } from '../lib/utils';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 教師登入憑證有效期限 7 天

export function getSetting(db: Db, key: string): string | null {
  const r = db.first('SELECT value FROM settings WHERE key = ?', key);
  return r ? str(r.value) : null;
}

export function setSetting(db: Db, key: string, value: string) {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

function createSession(db: Db): string {
  const token = crypto.randomUUID() + crypto.randomUUID();
  db.run('DELETE FROM sessions WHERE created_at < ?', Date.now() - SESSION_TTL_MS);
  db.run('INSERT INTO sessions (token, created_at) VALUES (?, ?)', token, Date.now());
  return token;
}

export function checkSession(db: Db, token: string): boolean {
  if (!token) return false;
  const r = db.first('SELECT created_at FROM sessions WHERE token = ?', token);
  return !!r && Number(r.created_at) > Date.now() - SESSION_TTL_MS;
}

export const routes: Routes = {
  public: {
    isTeacherPasswordSet(c: Ctx): Result {
      return { success: true, isSet: !!getSetting(c.db, 'teacherPassword') };
    },

    setupTeacherPassword(c: Ctx, password: string): Result {
      const pwd = str(password).trim();
      if (!pwd) return { success: false, message: '密碼不可為空！' };
      if (getSetting(c.db, 'teacherPassword')) return { success: false, message: '教師密碼已經設定過了，請直接登入。' };
      setSetting(c.db, 'teacherPassword', pwd);
      return { success: true, message: '教師密碼設定成功！', token: createSession(c.db) };
    },

    loginTeacher(c: Ctx, password: string): Result {
      const stored = getSetting(c.db, 'teacherPassword');
      if (!stored) return { success: false, message: '尚未設定教師密碼！' };
      if (stored === str(password).trim()) return { success: true, message: '登入成功！', token: createSession(c.db) };
      return { success: false, message: '密碼錯誤！' };
    }
  }
};
