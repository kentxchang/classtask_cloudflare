/** 共用小工具（與原 GAS Code.gs 的同名函式行為一致） */

export function genId(prefix: string): string {
  return prefix + '_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

// 檔案 ID 使用不可猜測的亂數（等同原本 Drive「知道連結的使用者皆可檢視」）
export function genFileId(): string {
  return 'F_' + crypto.randomUUID().replace(/-/g, '');
}

export const FILE_ID_RE = /F_[0-9a-f]{32}/g;

export function nowStr(): string {
  return new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
}

export function str(v: any): string {
  return v === null || v === undefined ? '' : String(v);
}

export function cleanCellText(v: any): string {
  const s = (v === null || v === undefined) ? '' : String(v).trim();
  return (s === 'undefined' || s === 'null') ? '' : s;
}

export function parseJson(s: any, fallback: any): any {
  try { return JSON.parse(s || ''); } catch (e) { return fallback; }
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result.map(s => s.trim());
}

export function zhSort(a: string, b: string): number {
  return a.localeCompare(b, 'zh-Hant');
}
