/**
 * 資料表結構（對應原本 Google 試算表的各個工作表）
 * 每次 Durable Object 啟動時執行，使用 IF NOT EXISTS，不會清除既有資料。
 * 日後要新增欄位，請在 initSchema() 中追加 ALTER TABLE 指令（先檢查欄位是否存在）。
 */
import { Db } from './db';

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS classes (id TEXT PRIMARY KEY, name TEXT, subject TEXT, join_code TEXT, gallery_enabled INTEGER, peer_enabled INTEGER, created_at TEXT);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, class_id TEXT, name TEXT, ord INTEGER, created_at TEXT);
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, class_id TEXT, category_id TEXT, type TEXT, title TEXT, description TEXT, config TEXT, ord INTEGER, published INTEGER, created_at TEXT);
  CREATE TABLE IF NOT EXISTS students (id TEXT PRIMARY KEY, name TEXT, account TEXT, password TEXT, created_at TEXT);
  CREATE TABLE IF NOT EXISTS enrollments (id TEXT PRIMARY KEY, class_id TEXT, student_id TEXT, joined_at TEXT);
  CREATE TABLE IF NOT EXISTS submissions (id TEXT PRIMARY KEY, task_id TEXT, class_id TEXT, student_id TEXT, student_name TEXT, content TEXT, status TEXT, score REAL, level TEXT, comment TEXT, submitted_at TEXT, graded_at TEXT, grade_count INTEGER);
  CREATE TABLE IF NOT EXISTS questions (id TEXT PRIMARY KEY, task_id TEXT, ord INTEGER, text TEXT, opt_a TEXT, opt_b TEXT, opt_c TEXT, opt_d TEXT, answer TEXT, explanation TEXT, ts REAL);
  CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, task_id TEXT, student_id TEXT, page INTEGER, data TEXT, updated_at TEXT);
  CREATE TABLE IF NOT EXISTS gallery (id TEXT PRIMARY KEY, submission_id TEXT, student_id TEXT, student_name TEXT, type TEXT, content TEXT, time TEXT);
  CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, class_id TEXT, name TEXT, mime TEXT, size INTEGER, created_at INTEGER);
  CREATE TABLE IF NOT EXISTS file_chunks (file_id TEXT, idx INTEGER, data TEXT, PRIMARY KEY (file_id, idx));
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, created_at INTEGER);
  CREATE INDEX IF NOT EXISTS idx_cat_class ON categories(class_id);
  CREATE INDEX IF NOT EXISTS idx_task_class ON tasks(class_id);
  CREATE INDEX IF NOT EXISTS idx_enr_class ON enrollments(class_id);
  CREATE INDEX IF NOT EXISTS idx_enr_student ON enrollments(student_id);
  CREATE INDEX IF NOT EXISTS idx_sub_task ON submissions(task_id, student_id);
  CREATE INDEX IF NOT EXISTS idx_sub_class ON submissions(class_id);
  CREATE INDEX IF NOT EXISTS idx_q_task ON questions(task_id);
  CREATE INDEX IF NOT EXISTS idx_note_task ON notes(task_id, student_id);
  CREATE INDEX IF NOT EXISTS idx_gal_sub ON gallery(submission_id);
  CREATE INDEX IF NOT EXISTS idx_files_class ON files(class_id);
`;

export function initSchema(db: Db) {
  db.sql.exec(SCHEMA_SQL);
}
