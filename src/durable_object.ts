/**
 * ============================================================
 *  剛好系列-課堂任務通 - Durable Object（SQLite 儲存後端）
 *  本檔只負責「接收請求 → 驗證教師身分 → 分派到各功能模組」，
 *  實際功能分散在 src/modules/*.ts，資料表結構在 src/lib/schema.ts。
 *
 *  - POST /api/<函式名稱>（body 為參數陣列）：呼叫模組函式，名稱與原 GAS 相同
 *  - GET  /f/<檔案ID>：讀取資料庫中的 base64 檔案
 * ============================================================
 */
import { DurableObject } from 'cloudflare:workers';
import { Ctx, Db } from './lib/db';
import { initSchema } from './lib/schema';
import { checkSession } from './modules/auth';
import { serveFile } from './modules/files';
import { PUBLIC_ROUTES, TEACHER_ROUTES } from './modules';

export interface Env {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

export class ClassroomDB extends DurableObject<Env> {
  db: Db;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.db = new Db(ctx.storage.sql, ctx.storage);
    initSchema(this.db);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/f/')) {
      return serveFile(this.db, decodeURIComponent(url.pathname.slice(3)), url.searchParams.has('download'));
    }

    const fnName = url.pathname.replace(/^\/api\//, '');
    let args: any[] = [];
    try {
      const body = await request.text();
      args = body ? JSON.parse(body) : [];
      if (!Array.isArray(args)) args = [args];
    } catch (e) {
      return Response.json({ success: false, message: '請求格式錯誤' }, { status: 400 });
    }

    const isTeacherFn = has(TEACHER_ROUTES, fnName);
    const handler = isTeacherFn ? TEACHER_ROUTES[fnName] : (has(PUBLIC_ROUTES, fnName) ? PUBLIC_ROUTES[fnName] : null);
    if (!handler) return Response.json({ success: false, message: '未知的 API：' + fnName }, { status: 404 });

    if (isTeacherFn && !checkSession(this.db, request.headers.get('X-Teacher-Token') || '')) {
      return Response.json({ success: false, message: '教師登入已失效，請回首頁重新登入教師帳號。' });
    }

    try {
      const c: Ctx = { db: this.db, origin: url.origin };
      const res = handler(c, ...args);
      return Response.json(res === undefined ? null : res);
    } catch (err: any) {
      return Response.json({ success: false, message: String(err && err.message ? err.message : err) });
    }
  }
}
