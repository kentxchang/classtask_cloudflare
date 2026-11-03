/**
 * ============================================================
 *  剛好系列-課堂任務通 - Worker 主入口
 *  - /api/<函式名稱>：轉交給 Durable Object（SQLite 資料庫）處理
 *  - /f/<檔案ID>   ：從資料庫讀出 base64 檔案並以圖片／檔案形式回傳
 *  - 其他路徑      ：交給 Static Assets（public/index.html）
 * ============================================================
 */
import { ClassroomDB, Env } from './durable_object';

export { ClassroomDB };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/f/')) {
      if (url.pathname.startsWith('/api/') && request.method !== 'POST') {
        return Response.json({ success: false, message: '請使用 POST 呼叫 API' }, { status: 405 });
      }
      // 全站共用同一個資料庫實例（名稱固定為 main），直接轉交原始請求（大型上傳也能串流傳遞）
      const stub = env.ROOMS.get(env.ROOMS.idFromName('main'));
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  }
};
