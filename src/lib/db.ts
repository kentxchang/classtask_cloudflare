/**
 * 資料庫存取小工具：包裝 Durable Object 內建 SQLite（this.ctx.storage.sql）
 * 所有模組都透過 Ctx.db 讀寫資料，不直接碰 SqlStorage。
 */
export type Row = Record<string, any>;
export type Result = Record<string, any>;

// SQLite 繫結不接受 undefined，一律轉成 null
function n(v: any): any {
  return v === undefined ? null : v;
}

export class Db {
  constructor(public sql: SqlStorage, public storage: DurableObjectStorage) {}

  all(q: string, ...b: any[]): Row[] {
    return this.sql.exec(q, ...b.map(n)).toArray() as Row[];
  }

  first(q: string, ...b: any[]): Row | null {
    const r = this.all(q, ...b);
    return r.length ? r[0] : null;
  }

  run(q: string, ...b: any[]): void {
    this.sql.exec(q, ...b.map(n));
  }

  count(q: string, ...b: any[]): number {
    const r = this.first(q, ...b);
    return r ? Number(Object.values(r)[0] || 0) : 0;
  }

  // 同步交易：fn 內任何一步失敗都會整批還原
  tx<T>(fn: () => T): T {
    return this.storage.transactionSync(fn);
  }

  get databaseSize(): number {
    return this.sql.databaseSize;
  }
}

// 每次 API 呼叫的執行環境
export interface Ctx {
  db: Db;
  origin: string; // 例如 https://xxx.workers.dev，用於產生分享網址
}

// 各模組匯出的 API 路由：teacher = 需教師登入；public = 學生端／公開頁面可呼叫
export type Handler = (c: Ctx, ...args: any[]) => any;
export interface Routes {
  teacher?: Record<string, Handler>;
  public?: Record<string, Handler>;
}
