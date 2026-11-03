/**
 * ============================================================
 *  剛好系列-課堂任務通 - Code.gs (GAS 後端伺服器)
 *  採「容器綁定試算表」架構：本腳本必須從 Google 試算表的
 *  「擴充功能 > Apps Script」開啟，資料庫即為目前綁定的這份試算表。
 * ============================================================
 */

// ================= 0. Web App 進入點 =================

function doGet(e) {
  const tpl = HtmlService.createTemplateFromFile('Index');
  const rawCode = (e && e.parameter && e.parameter.code) ? String(e.parameter.code) : '';
  tpl.initJoinCode = rawCode.replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  const rawGallery = (e && e.parameter && e.parameter.gallery) ? String(e.parameter.gallery) : '';
  tpl.initGalleryTaskId = rawGallery.replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
  return tpl.evaluate()
    .setTitle('剛好系列-課堂任務通')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getWebAppUrl() {
  try {
    return ScriptApp.getService().getUrl();
  } catch (e) {
    return '';
  }
}

// ================= 1. 資料庫初始化 =================

const SHEETS = {
  SETTINGS: '系統設定',
  CLASSES: '課堂資料',
  CATEGORIES: '分類頁籤',
  TASKS: '任務資料',
  STUDENTS: '學生資料',
  ENROLLMENTS: '課堂學生',
  SUBMISSIONS: '提交紀錄',
  QUESTIONS: '測驗題目',
  NOTES: '畫記筆記',
  GALLERY: '藝廊互動'
};

function getActiveSsOrThrow() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('請確認此 GAS 專案是直接從 Google 試算表的「擴充功能」>「Apps Script」開啟的（容器綁定），而不是獨立建立的專案。');
  }
  return ss;
}

function initDatabase() {
  const ss = getActiveSsOrThrow();
  const defs = [
    { name: SHEETS.SETTINGS, headers: ['設定項目', '設定值'] },
    { name: SHEETS.CLASSES, headers: ['課堂ID', '課堂名稱', '科目', '加入代碼', '展示牆開關', '互評開關', '建立時間'] },
    { name: SHEETS.CATEGORIES, headers: ['分類ID', '課堂ID', '分類名稱', '排序', '建立時間'] },
    { name: SHEETS.TASKS, headers: ['任務ID', '課堂ID', '分類ID', '任務類型', '標題', '說明', '內容設定JSON', '排序', '上架狀態', '建立時間'] },
    { name: SHEETS.STUDENTS, headers: ['學生ID', '姓名', '帳號', '密碼', '建立時間'] },
    { name: SHEETS.ENROLLMENTS, headers: ['記錄ID', '課堂ID', '學生ID', '加入時間'] },
    { name: SHEETS.SUBMISSIONS, headers: ['提交ID', '任務ID', '課堂ID', '學生ID', '學生姓名', '內容JSON', '狀態', '分數', '等第', '評語', '提交時間', '批改時間', '批改次數'] },
    { name: SHEETS.QUESTIONS, headers: ['題目ID', '任務ID', '順序', '題幹', '選項A', '選項B', '選項C', '選項D', '正解', '詳解', '影片時間點'] },
    { name: SHEETS.NOTES, headers: ['筆記ID', '任務ID', '學生ID', '頁碼', '畫記資料JSON', '更新時間'] },
    { name: SHEETS.GALLERY, headers: ['互動ID', '提交ID', '學生ID', '學生姓名', '類型', '內容', '時間'] }
  ];

  defs.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      sheet.appendRow(def.headers);
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground('#1e40af').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    } else if (sheet.getLastRow() === 0) {
      sheet.appendRow(def.headers);
      sheet.getRange(1, 1, 1, def.headers.length).setFontWeight('bold').setBackground('#1e40af').setFontColor('#FFFFFF');
      sheet.setFrozenRows(1);
    }
  });

  // 密碼欄位強制設為純文字，避免數字密碼被自動轉型
  ss.getSheetByName(SHEETS.STUDENTS).getRange('D:D').setNumberFormat('@');

  // 移除預設空白工作表 (工作表1 / Sheet1)，僅在已成功建立其他工作表後才清除
  const defaultSheet = ss.getSheetByName('工作表1') || ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > defs.length) {
    try { ss.deleteSheet(defaultSheet); } catch (err) {}
  }
  return ss;
}

function getSheet(name) {
  const ss = getActiveSsOrThrow();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    initDatabase();
    sheet = ss.getSheetByName(name);
  }
  return sheet;
}

function genId(prefix) {
  return prefix + '_' + new Date().getTime() + '_' + Math.floor(Math.random() * 10000);
}

function nowStr() {
  return new Date().toLocaleString('zh-TW');
}

function sheetToObjects(sheet, mapper) {
  const data = sheet.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    out.push(mapper(data[i], i + 1));
  }
  return out;
}

function findRowIndexById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

// ================= 2. Google Drive 檔案處理 =================

function getRootFolder() {
  const ss = getActiveSsOrThrow();
  const parentFolder = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents().next();
  const uploadFolderIter = parentFolder.getFoldersByName('上傳的資料');
  if (uploadFolderIter.hasNext()) {
    return uploadFolderIter.next();
  }
  return parentFolder.createFolder('上傳的資料');
}

function getOrCreateSubFolder(parentFolder, name) {
  const safeName = String(name || '未命名').replace(/[\\/:*?"<>|]/g, '_');
  const iter = parentFolder.getFoldersByName(safeName);
  if (iter.hasNext()) return iter.next();
  return parentFolder.createFolder(safeName);
}

// 依課程／分類，取得（或建立）「上傳的資料 / 課程名稱 / 分類名稱」巢狀資料夾，
// 讓 Google Drive 內的檔案結構跟平台的課程／分類結構一致，方便教師直接在雲端硬碟裡找檔案。
// 找不到對應課程／分類時（例如資料被刪除），退回「未命名課程」「未分類」，不中斷上傳流程。
function getClassCategoryFolder(classId, categoryId) {
  const rootFolder = getRootFolder();
  let className = '未命名課程';
  let categoryName = '未分類';
  try {
    const classSheet = getSheet(SHEETS.CLASSES);
    const classRow = findRowIndexById(classSheet, classId);
    if (classRow !== -1) className = String(classSheet.getRange(classRow, 2).getValue() || className);
  } catch (err) {}
  try {
    const catSheet = getSheet(SHEETS.CATEGORIES);
    const catRow = findRowIndexById(catSheet, categoryId);
    if (catRow !== -1) categoryName = String(catSheet.getRange(catRow, 3).getValue() || categoryName);
  } catch (err) {}
  const classFolder = getOrCreateSubFolder(rootFolder, className);
  return getOrCreateSubFolder(classFolder, categoryName);
}

/**
 * 通用檔案上傳：接收前端傳來的 Base64 資料，存入
 * 上傳的資料 / {課程名稱} / {分類名稱} / {folderName} / 內，回傳 Drive 檔案 ID。
 * 試算表內只會儲存這個檔案 ID，不會儲存原始 Base64。
 * payload 若帶有 classId／categoryId，會巢狀存放於對應課程／分類資料夾內；
 * 未帶（例如舊呼叫端尚未更新）則退回直接存在「上傳的資料」根目錄，維持相容。
 */
// Drive 檔案預設為私人權限，只有擁有者（教師帳號）能看到縮圖。
// 由於學生是以自己的瀏覽器（不一定登入同一個 Google 帳號）讀取 thumbnail 連結，
// 必須將檔案設為「知道連結的使用者皆可檢視」，圖片才能在任何裝置上正常顯示。
function makeFileViewableByLink(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    // 若網域政策禁止「知道連結的使用者」分享，仍略過不中斷上傳流程
  }
}

function uploadFile(payload) {
  try {
    const baseFolder = (payload.classId && payload.categoryId) ? getClassCategoryFolder(payload.classId, payload.categoryId) : getRootFolder();
    const subFolder = getOrCreateSubFolder(baseFolder, payload.folderName || '未分類');
    const base64Data = String(payload.base64Data).split(',').pop();
    const bytes = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(bytes, payload.mimeType || 'application/octet-stream', payload.fileName || ('file_' + new Date().getTime()));
    const file = subFolder.createFile(blob);
    makeFileViewableByLink(file);
    return { success: true, fileId: file.getId(), fileName: file.getName() };
  } catch (err) {
    return { success: false, message: '檔案上傳失敗：' + err.toString() };
  }
}

/**
 * PDF 電子書上傳（壓縮成圖片方式，比照參考書櫃程式）：
 * 1. 前端以 pdf.js 將 PDF 逐頁轉為 JPEG Base64
 * 2. 呼叫 initPdfPageFolder 一次，建立本次上傳專屬資料夾
 * 3. 逐頁呼叫 uploadPdfPage，直接存入該資料夾（避免每頁都重新查找/建立資料夾）
 */
function initPdfPageFolder(title, classId, categoryId) {
  try {
    const baseFolder = (classId && categoryId) ? getClassCategoryFolder(classId, categoryId) : getRootFolder();
    const folder = getOrCreateSubFolder(baseFolder, 'PDF教材_' + title + '_' + genId('BOOK'));
    return { success: true, folderId: folder.getId() };
  } catch (err) {
    return { success: false, message: '建立雲端資料夾失敗：' + err.toString() };
  }
}

function uploadPdfPage(folderId, pageIndex, base64Data) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const base64 = String(base64Data).split(',').pop();
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, 'image/jpeg', 'page_' + (Number(pageIndex) + 1) + '.jpg');
    const file = folder.createFile(blob);
    makeFileViewableByLink(file);
    return { success: true, fileId: file.getId(), pageIndex: Number(pageIndex) };
  } catch (err) {
    return { success: false, message: '第 ' + (Number(pageIndex) + 1) + ' 頁上傳失敗：' + err.toString() };
  }
}

/**
 * 修復舊資料：在加入「知道連結的使用者皆可檢視」機制之前上傳的檔案，
 * 權限仍是私人的，縮圖在學生端會顯示不出來。教師可於課堂列表頁點選
 * 「🔧 修復圖片顯示權限」執行一次，遞迴走訪「上傳的資料」資料夾內所有檔案並修正權限。
 */
function repairAllFileSharing() {
  try {
    const rootFolder = getRootFolder();
    let fixedCount = 0;
    let skippedCount = 0;
    const walk = (folder) => {
      const files = folder.getFiles();
      while (files.hasNext()) {
        const file = files.next();
        if (file.getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK) {
          skippedCount++;
        } else {
          makeFileViewableByLink(file);
          fixedCount++;
        }
      }
      const subFolders = folder.getFolders();
      while (subFolders.hasNext()) {
        walk(subFolders.next());
      }
    };
    walk(rootFolder);
    return { success: true, message: `修復完成！本次修正 ${fixedCount} 個檔案，${skippedCount} 個檔案原本權限已正確、已略過。` };
  } catch (err) {
    return { success: false, message: '修復失敗：' + err.toString() };
  }
}

function getFileBase64(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    const base64 = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    return { success: true, base64: base64, fileName: file.getName() };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getThumbnailUrl(fileId) {
  return fileId ? ('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w800') : '';
}

// ================= 3. 系統設定 / 教師登入 =================

function getSetting(key) {
  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function setSetting(key, value) {
  const sheet = getSheet(SHEETS.SETTINGS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function isTeacherPasswordSet() {
  try {
    const pwd = getSetting('teacherPassword');
    return { success: true, isSet: !!pwd };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function setupTeacherPassword(password) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const pwd = String(password || '').trim();
    if (!pwd) return { success: false, message: '密碼不可為空！' };
    if (getSetting('teacherPassword')) {
      return { success: false, message: '教師密碼已經設定過了，請直接登入。' };
    }
    setSetting('teacherPassword', pwd);
    return { success: true, message: '教師密碼設定成功！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function loginTeacher(password) {
  try {
    const stored = getSetting('teacherPassword');
    if (!stored) return { success: false, message: '尚未設定教師密碼！' };
    if (String(stored) === String(password || '').trim()) {
      return { success: true, message: '登入成功！' };
    }
    return { success: false, message: '密碼錯誤！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 4. 課堂管理 =================

// 預設自動產生 4 位數字組合（例如 0428）；教師可於課堂設定手動改為 4 碼英數字組合
function generateJoinCode() {
  const sheet = getSheet(SHEETS.CLASSES);
  const data = sheet.getDataRange().getValues();
  const existing = new Set();
  for (let i = 1; i < data.length; i++) existing.add(String(data[i][3]));
  let code;
  do {
    code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  } while (existing.has(code));
  return code;
}

// 教師手動修改課堂代碼：限制為 4 碼英數字組合，且不可與其他課堂重複
function updateClassJoinCode(classId, newCode) {
  try {
    const code = String(newCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
      return { success: false, message: '課堂代碼須為 4 碼英數字組合！' };
    }
    const sheet = getSheet(SHEETS.CLASSES);
    const row = findRowIndexById(sheet, classId);
    if (row === -1) return { success: false, message: '找不到課堂！' };

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) !== String(classId) && String(data[i][3]).toUpperCase() === code) {
        return { success: false, message: `課堂代碼《${code}》已被其他課堂使用，請換一組！` };
      }
    }
    sheet.getRange(row, 4).setValue(code);
    return { success: true, message: '課堂代碼已更新！', joinCode: code };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function classRowToObj(row) {
  return {
    id: String(row[0]),
    name: String(row[1]),
    subject: String(row[2] || ''),
    joinCode: String(row[3]),
    galleryEnabled: row[4] === true || String(row[4]).toUpperCase() === 'TRUE',
    peerInteractionEnabled: row[5] === true || String(row[5]).toUpperCase() === 'TRUE',
    createdAt: row[6] ? String(row[6]) : ''
  };
}

function createClass(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(SHEETS.CLASSES);
    const name = String(payload.name || '').trim();
    if (!name) return { success: false, message: '課堂名稱不可為空！' };
    const classId = genId('CLS');
    const joinCode = generateJoinCode();
    sheet.appendRow([classId, name, String(payload.subject || ''), joinCode, true, true, nowStr()]);
    return { success: true, message: '課堂建立成功！', classId: classId, joinCode: joinCode };
  } catch (err) {
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function getClasses() {
  try {
    const sheet = getSheet(SHEETS.CLASSES);
    const list = sheetToObjects(sheet, classRowToObj);
    return { success: true, data: list.reverse() };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getClassById(classId) {
  try {
    const sheet = getSheet(SHEETS.CLASSES);
    const row = findRowIndexById(sheet, classId);
    if (row === -1) return { success: false, message: '找不到課堂！' };
    const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    return { success: true, data: classRowToObj(values) };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function updateClass(classId, fields) {
  try {
    const sheet = getSheet(SHEETS.CLASSES);
    const row = findRowIndexById(sheet, classId);
    if (row === -1) return { success: false, message: '找不到課堂！' };
    if (fields.name !== undefined) sheet.getRange(row, 2).setValue(fields.name);
    if (fields.subject !== undefined) sheet.getRange(row, 3).setValue(fields.subject);
    if (fields.galleryEnabled !== undefined) sheet.getRange(row, 5).setValue(!!fields.galleryEnabled);
    if (fields.peerInteractionEnabled !== undefined) sheet.getRange(row, 6).setValue(!!fields.peerInteractionEnabled);
    return { success: true, message: '課堂設定已更新！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function deleteClass(classId) {
  try {
    const classSheet = getSheet(SHEETS.CLASSES);
    const row = findRowIndexById(classSheet, classId);
    if (row === -1) return { success: false, message: '找不到課堂！' };
    classSheet.deleteRow(row);

    deleteRowsWhere(getSheet(SHEETS.CATEGORIES), r => String(r[1]) === String(classId));
    const taskIds = sheetToObjects(getSheet(SHEETS.TASKS), r => r).filter(r => String(r[1]) === String(classId)).map(r => String(r[0]));
    deleteRowsWhere(getSheet(SHEETS.TASKS), r => String(r[1]) === String(classId));
    deleteRowsWhere(getSheet(SHEETS.ENROLLMENTS), r => String(r[1]) === String(classId));
    deleteRowsWhere(getSheet(SHEETS.SUBMISSIONS), r => String(r[2]) === String(classId));
    taskIds.forEach(tid => {
      deleteRowsWhere(getSheet(SHEETS.QUESTIONS), r => String(r[1]) === tid);
      deleteRowsWhere(getSheet(SHEETS.NOTES), r => String(r[1]) === tid);
    });

    return { success: true, message: '課堂已刪除（含所屬分類、任務、學生名單指派與繳交紀錄；學生總名單本身不受影響）。' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function deleteRowsWhere(sheet, predicate) {
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] && predicate(data[i])) sheet.deleteRow(i + 1);
  }
}

// ================= 5. 分類頁籤管理 =================

function categoryRowToObj(row) {
  return { id: String(row[0]), classId: String(row[1]), name: String(row[2]), order: Number(row[3] || 0), createdAt: row[4] ? String(row[4]) : '' };
}

function getCategories(classId) {
  try {
    const sheet = getSheet(SHEETS.CATEGORIES);
    const list = sheetToObjects(sheet, categoryRowToObj).filter(c => c.classId === String(classId));
    list.sort((a, b) => a.order - b.order);
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function createCategory(classId, name) {
  try {
    const sheet = getSheet(SHEETS.CATEGORIES);
    const nm = String(name || '').trim();
    if (!nm) return { success: false, message: '分類名稱不可為空！' };
    const existing = sheetToObjects(sheet, categoryRowToObj).filter(c => c.classId === String(classId));
    const order = existing.length;
    const id = genId('CAT');
    sheet.appendRow([id, classId, nm, order, nowStr()]);
    return { success: true, message: '分類建立成功！', data: { id, classId: String(classId), name: nm, order } };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function renameCategory(categoryId, name) {
  try {
    const sheet = getSheet(SHEETS.CATEGORIES);
    const row = findRowIndexById(sheet, categoryId);
    if (row === -1) return { success: false, message: '找不到分類！' };
    sheet.getRange(row, 3).setValue(name);
    return { success: true, message: '分類已更名！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function deleteCategory(categoryId) {
  try {
    const sheet = getSheet(SHEETS.CATEGORIES);
    const row = findRowIndexById(sheet, categoryId);
    if (row === -1) return { success: false, message: '找不到分類！' };
    sheet.deleteRow(row);
    deleteRowsWhere(getSheet(SHEETS.TASKS), r => String(r[2]) === String(categoryId));
    return { success: true, message: '分類已刪除（含分類內所有任務）。' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function reorderCategories(orderedIds) {
  try {
    const sheet = getSheet(SHEETS.CATEGORIES);
    orderedIds.forEach((id, idx) => {
      const row = findRowIndexById(sheet, id);
      if (row !== -1) sheet.getRange(row, 4).setValue(idx);
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 6. 任務（課堂互動元件）管理 =================

const TASK_TYPES = ['LINK', 'PDF', 'FILE_SHARE', 'YOUTUBE', 'PHOTO_TEXT', 'DRAWING', 'QUIZ'];

function taskRowToObj(row) {
  let config = {};
  try { config = JSON.parse(row[6] || '{}'); } catch (e) { config = {}; }
  return {
    id: String(row[0]),
    classId: String(row[1]),
    categoryId: String(row[2]),
    type: String(row[3]),
    title: String(row[4]),
    description: String(row[5] || ''),
    config: config,
    order: Number(row[7] || 0),
    published: row[8] === true || String(row[8]).toUpperCase() === 'TRUE',
    createdAt: row[9] ? String(row[9]) : ''
  };
}

function getTasks(classId) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    const list = sheetToObjects(sheet, taskRowToObj).filter(t => t.classId === String(classId));
    list.sort((a, b) => a.order - b.order);
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function createTask(payload) {
  try {
    if (TASK_TYPES.indexOf(payload.type) === -1) return { success: false, message: '未知的任務類型！' };
    const title = String(payload.title || '').trim();
    if (!title) return { success: false, message: '任務標題不可為空！' };
    const sheet = getSheet(SHEETS.TASKS);
    const siblings = sheetToObjects(sheet, taskRowToObj).filter(t => t.categoryId === String(payload.categoryId));
    const id = genId('TASK');
    sheet.appendRow([
      id, payload.classId, payload.categoryId, payload.type, title,
      String(payload.description || ''), JSON.stringify(payload.config || {}),
      siblings.length, true, nowStr()
    ]);
    return { success: true, message: '任務建立成功！', taskId: id };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function updateTask(taskId, fields) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    const row = findRowIndexById(sheet, taskId);
    if (row === -1) return { success: false, message: '找不到任務！' };
    if (fields.title !== undefined) sheet.getRange(row, 5).setValue(fields.title);
    if (fields.description !== undefined) sheet.getRange(row, 6).setValue(fields.description);
    if (fields.config !== undefined) sheet.getRange(row, 7).setValue(JSON.stringify(fields.config));
    return { success: true, message: '任務已更新！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function toggleTaskPublish(taskId, published) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    const row = findRowIndexById(sheet, taskId);
    if (row === -1) return { success: false, message: '找不到任務！' };
    sheet.getRange(row, 9).setValue(!!published);
    return { success: true, message: published ? '任務已上架！' : '任務已下架！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function deleteTask(taskId) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    const row = findRowIndexById(sheet, taskId);
    if (row === -1) return { success: false, message: '找不到任務！' };
    sheet.deleteRow(row);
    deleteRowsWhere(getSheet(SHEETS.SUBMISSIONS), r => String(r[1]) === String(taskId));
    deleteRowsWhere(getSheet(SHEETS.QUESTIONS), r => String(r[1]) === String(taskId));
    deleteRowsWhere(getSheet(SHEETS.NOTES), r => String(r[1]) === String(taskId));
    return { success: true, message: '任務已刪除！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function reorderTasks(orderedIds) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    orderedIds.forEach((id, idx) => {
      const row = findRowIndexById(sheet, id);
      if (row !== -1) sheet.getRange(row, 8).setValue(idx);
    });
    return { success: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 7. 測驗題目（QUIZ / YOUTUBE 共用） =================

function questionRowToObj(row) {
  return {
    id: String(row[0]), taskId: String(row[1]), order: Number(row[2] || 0),
    text: String(row[3] || ''), options: [String(row[4] || ''), String(row[5] || ''), String(row[6] || ''), String(row[7] || '')],
    answer: String(row[8] || 'A'), explanation: String(row[9] || ''),
    timestamp: row[10] === '' || row[10] === undefined ? null : Number(row[10])
  };
}

function getQuizQuestions(taskId) {
  try {
    const sheet = getSheet(SHEETS.QUESTIONS);
    const list = sheetToObjects(sheet, questionRowToObj).filter(q => q.taskId === String(taskId));
    list.sort((a, b) => a.order - b.order);
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 學生作答用：不含正解與詳解，避免透過前端原始碼洩漏答案
function getQuizQuestionsForStudent(taskId) {
  try {
    const res = getQuizQuestions(taskId);
    if (!res.success) return res;
    const safe = res.data.map(q => ({ id: q.id, order: q.order, text: q.text, options: q.options, timestamp: q.timestamp }));
    return { success: true, data: safe };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function saveQuizQuestion(q) {
  try {
    const sheet = getSheet(SHEETS.QUESTIONS);
    const existing = sheetToObjects(sheet, questionRowToObj).filter(x => x.taskId === String(q.taskId));
    if (q.id) {
      const row = findRowIndexById(sheet, q.id);
      if (row !== -1) {
        sheet.getRange(row, 4, 1, 8).setValues([[q.text, q.options[0], q.options[1], q.options[2], q.options[3], q.answer, q.explanation || '', q.timestamp === null || q.timestamp === undefined || q.timestamp === '' ? '' : Number(q.timestamp)]]);
        return { success: true, message: '題目已更新！' };
      }
    }
    const id = genId('Q');
    sheet.appendRow([id, q.taskId, existing.length, q.text, q.options[0], q.options[1], q.options[2], q.options[3], q.answer, q.explanation || '', q.timestamp === null || q.timestamp === undefined || q.timestamp === '' ? '' : Number(q.timestamp)]);
    return { success: true, message: '題目已新增！', id: id };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * 批次匯入題庫：CSV 每行格式為
 * 題幹,選項A,選項B,選項C,選項D,正解(A/B/C/D),詳解(可空),影片時間點秒數(可空,YOUTUBE專用)
 */
function batchImportQuizQuestions(taskId, csvText) {
  try {
    const sheet = getSheet(SHEETS.QUESTIONS);
    const lines = String(csvText).split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
    const existing = sheetToObjects(sheet, questionRowToObj).filter(x => x.taskId === String(taskId));
    let order = existing.length;
    let count = 0;
    const rows = [];
    lines.forEach(line => {
      const cols = parseCsvLine(line);
      if (cols.length < 6) return;
      if (cols[0] === '題幹' || cols[0] === '題目') return; // 跳過表頭行
      const id = genId('Q');
      rows.push([id, taskId, order, cols[0], cols[1] || '', cols[2] || '', cols[3] || '', cols[4] || '', String(cols[5] || 'A').toUpperCase(), cols[6] || '', cols[7] === undefined || cols[7] === '' ? '' : Number(cols[7])]);
      order++;
      count++;
    });
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { success: true, message: `成功匯入 ${count} 題！` };
  } catch (err) {
    return { success: false, message: '批次匯入失敗：' + err.toString() };
  }
}

function parseCsvLine(line) {
  const result = [];
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

function deleteQuizQuestion(questionId) {
  try {
    const sheet = getSheet(SHEETS.QUESTIONS);
    const row = findRowIndexById(sheet, questionId);
    if (row === -1) return { success: false, message: '找不到題目！' };
    sheet.deleteRow(row);
    return { success: true, message: '題目已刪除！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 8. 學生帳號管理（全校通用學生名單，非綁定單一課堂） =================

function studentRowToObj(row) {
  return { id: String(row[0]), name: String(row[1]), account: String(row[2] || ''), password: String(row[3] || ''), createdAt: row[4] ? String(row[4]) : '' };
}

// 教師後台：全域學生總名單管理（含密碼）
function getAllStudents() {
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const list = sheetToObjects(sheet, studentRowToObj);
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 檢查是否已啟用免密碼登入
function isStudentNoPasswordEnabled() {
  const val = getSetting('studentNoPassword');
  return val === 'true' || val === true;
}

// 取得學生登入設定（免密碼開關狀態）
function getStudentLoginSettings() {
  try {
    return { success: true, noPassword: isStudentNoPasswordEnabled() };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 儲存學生登入設定（教師端設定是否免密碼登入）
function setStudentLoginSettings(noPassword) {
  try {
    const val = (noPassword === true || String(noPassword).toLowerCase() === 'true');
    setSetting('studentNoPassword', val ? 'true' : 'false');
    return {
      success: true,
      noPassword: val,
      message: val ? '設定成功！學生已可不用密碼直接登入。' : '設定成功！已改為學生需輸入密碼登入。'
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 提供學生登入畫面使用的公開名單（全域，不含密碼，並回傳免密碼設定）
function getStudentRoster() {
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const list = sheetToObjects(sheet, studentRowToObj).map(s => ({ id: s.id, name: s.name }));
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    const noPwd = isStudentNoPasswordEnabled();
    return { success: true, data: list, noPassword: noPwd };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function createStudent(name, password) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const nm = String(name || '').trim();
    const pwd = String(password || '').trim();
    if (!nm || !pwd) return { success: false, message: '姓名與密碼皆為必填！' };
    const existing = sheetToObjects(sheet, studentRowToObj);
    if (existing.some(s => s.name === nm)) return { success: false, message: `學生《${nm}》已存在於學生總名單中！` };
    const id = genId('STU');
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 4).setNumberFormat('@');
    sheet.getRange(nextRow, 1, 1, 5).setValues([[id, nm, nm, "'" + pwd, nowStr()]]);
    return { success: true, message: `學生《${nm}》新增成功！` };
  } catch (err) {
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 批次新增：每行格式「姓名,密碼」
 */
function batchCreateStudents(text) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const existing = sheetToObjects(sheet, studentRowToObj);
    const existingNames = new Set(existing.map(s => s.name));
    const lines = String(text).split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
    let added = 0, skipped = 0;
    const rows = [];
    lines.forEach(line => {
      const cols = parseCsvLine(line);
      const nm = String(cols[0] || '').trim();
      const pwd = String(cols[1] || '').trim();
      if (nm && pwd && !existingNames.has(nm)) {
        existingNames.add(nm);
        rows.push([genId('STU'), nm, nm, "'" + pwd, nowStr()]);
        added++;
      } else {
        skipped++;
      }
    });
    if (rows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 4, rows.length, 1).setNumberFormat('@');
      sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { success: true, message: `批次新增完成：成功 ${added} 位，略過重複 ${skipped} 位。` };
  } catch (err) {
    return { success: false, message: err.toString() };
  } finally {
    lock.releaseLock();
  }
}

function resetStudentPassword(studentId, newPassword) {
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const row = findRowIndexById(sheet, studentId);
    if (row === -1) return { success: false, message: '找不到學生！' };
    sheet.getRange(row, 4).setNumberFormat('@').setValue("'" + String(newPassword).trim());
    return { success: true, message: '密碼已重設！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function deleteStudent(studentId) {
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const row = findRowIndexById(sheet, studentId);
    if (row === -1) return { success: false, message: '找不到學生！' };
    sheet.deleteRow(row);
    deleteRowsWhere(getSheet(SHEETS.ENROLLMENTS), r => String(r[2]) === String(studentId));
    return { success: true, message: '學生已刪除（並移除其所有課堂的名單資格）！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function loginStudent(studentId, password) {
  try {
    const sheet = getSheet(SHEETS.STUDENTS);
    const row = findRowIndexById(sheet, studentId);
    if (row === -1) return { success: false, message: '找不到學生帳號！' };
    const values = sheet.getRange(row, 1, 1, 5).getDisplayValues()[0];
    // 若開啟免密碼登入，確認學生存在即可直接登入
    if (isStudentNoPasswordEnabled()) {
      return { success: true, message: '登入成功！', data: { id: values[0], name: values[1] } };
    }
    if (String(values[3]).trim() === String(password || '').trim()) {
      return { success: true, message: '登入成功！', data: { id: values[0], name: values[1] } };
    }
    return { success: false, message: '密碼不正確！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 8.5 課堂與學生的名單指派（多對多） =================

// 設定某課堂的完整學生名單（覆蓋式：傳入的 studentIds 即為最終名單）
function setClassEnrollment(classId, studentIds) {
  try {
    const sheet = getSheet(SHEETS.ENROLLMENTS);
    deleteRowsWhere(sheet, r => String(r[1]) === String(classId));
    const ids = Array.isArray(studentIds) ? studentIds : [];
    if (ids.length > 0) {
      const rows = ids.map(sid => [genId('ENR'), classId, sid, nowStr()]);
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }
    return { success: true, message: `已更新課堂名單，共 ${ids.length} 位學生。` };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getEnrolledStudentIds(classId) {
  try {
    const sheet = getSheet(SHEETS.ENROLLMENTS);
    const data = sheet.getDataRange().getValues();
    const ids = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(classId)) ids.push(String(data[i][2]));
    }
    return { success: true, data: ids };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 課堂「學生名單」分頁使用：回傳該課堂已加入的學生完整資料
function getEnrolledStudents(classId) {
  try {
    const idsRes = getEnrolledStudentIds(classId);
    if (!idsRes.success) return idsRes;
    const idSet = new Set(idsRes.data);
    const all = sheetToObjects(getSheet(SHEETS.STUDENTS), studentRowToObj);
    const list = all.filter(s => idSet.has(s.id));
    list.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 學生登入後：回傳該學生已被加入的課堂清單
function getClassesForStudent(studentId) {
  try {
    const enrollSheet = getSheet(SHEETS.ENROLLMENTS);
    const data = enrollSheet.getDataRange().getValues();
    const classIds = [];
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][2]) === String(studentId)) classIds.push(String(data[i][1]));
    }
    const idSet = new Set(classIds);
    const allClasses = sheetToObjects(getSheet(SHEETS.CLASSES), classRowToObj);
    const list = allClasses.filter(c => idSet.has(c.id));
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 9. 學生任務提交與教師批改 =================

// 清理儲存格讀出的值：把空白／undefined／null 一律視為空字串，
// 並防範儲存格內若曾經誤存入字面上的 "undefined"／"null" 文字時，前端顯示會出現這些字樣
function cleanCellText(v) {
  const s = (v === null || v === undefined) ? '' : String(v).trim();
  return (s === 'undefined' || s === 'null') ? '' : s;
}

function submissionRowToObj(row) {
  let content = {};
  try { content = JSON.parse(row[5] || '{}'); } catch (e) { content = {}; }
  const scoreRaw = cleanCellText(row[7]);
  return {
    id: String(row[0]), taskId: String(row[1]), classId: String(row[2]), studentId: String(row[3]),
    studentName: String(row[4] || ''), content: content, status: String(row[6] || ''),
    score: scoreRaw === '' ? null : Number(scoreRaw), level: cleanCellText(row[8]), comment: cleanCellText(row[9]),
    submittedAt: row[10] ? String(row[10]) : '', gradedAt: row[11] ? String(row[11]) : '', gradeCount: Number(row[12] || 0)
  };
}

function getSubmission(taskId, studentId) {
  try {
    const sheet = getSheet(SHEETS.SUBMISSIONS);
    const list = sheetToObjects(sheet, submissionRowToObj).filter(s => s.taskId === String(taskId) && s.studentId === String(studentId));
    return { success: true, data: list.length ? list[list.length - 1] : null };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getSubmissionsForTask(taskId) {
  try {
    const sheet = getSheet(SHEETS.SUBMISSIONS);
    const list = sheetToObjects(sheet, submissionRowToObj).filter(s => s.taskId === String(taskId));
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * 全班進度總覽矩陣：{ students:[...], tasks:[...], matrix:{studentId:{taskId:submission}} }
 */
function getClassOverview(classId) {
  try {
    const enrolledRes = getEnrolledStudents(classId);
    const students = enrolledRes.success ? enrolledRes.data : [];
    const tasks = sheetToObjects(getSheet(SHEETS.TASKS), taskRowToObj).filter(t => t.classId === String(classId));
    const subs = sheetToObjects(getSheet(SHEETS.SUBMISSIONS), submissionRowToObj).filter(s => s.classId === String(classId));
    const matrix = {};
    students.forEach(s => { matrix[s.id] = {}; });
    subs.forEach(sub => {
      if (!matrix[sub.studentId]) matrix[sub.studentId] = {};
      matrix[sub.studentId][sub.taskId] = sub;
    });
    return {
      success: true,
      data: {
        students: students.map(s => ({ id: s.id, name: s.name })),
        tasks: tasks.sort((a, b) => a.order - b.order).map(t => ({ id: t.id, title: t.title, type: t.type, categoryId: t.categoryId })),
        matrix: matrix
      }
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function upsertSubmissionRow(taskId, classId, studentId, studentName, content, status, score, level, comment) {
  const sheet = getSheet(SHEETS.SUBMISSIONS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(taskId) && String(data[i][3]) === String(studentId)) {
      const row = i + 1;
      const gradeCount = status === '待批改' ? Number(data[i][12] || 0) : Number(data[i][12] || 0) + 1;
      sheet.getRange(row, 6, 1, 8).setValues([[JSON.stringify(content), status, score === null || score === undefined ? '' : score, level || '', comment || '', nowStr(), status === '待批改' ? '' : nowStr(), gradeCount]]);
      return String(data[i][0]);
    }
  }
  const id = genId('SUB');
  sheet.appendRow([id, taskId, classId, studentId, studentName, JSON.stringify(content), status, score === null || score === undefined ? '' : score, level || '', comment || '', nowStr(), status === '待批改' ? '' : nowStr(), 0]);
  return id;
}

/**
 * 學生提交任務。type 決定 payload 結構與是否自動批改：
 * LINK/PDF -> { markRead:true } 直接完成
 * PHOTO_TEXT -> { text, photos:[{base64,mimeType,fileName}] }
 * DRAWING -> { base64, mimeType }
 * QUIZ/YOUTUBE -> { answers:[{questionId,selected}] }
 */
function submitTask(payload) {
  try {
    const taskRes = getTasks(payload.classId);
    const task = (taskRes.data || []).find(t => t.id === payload.taskId);
    if (!task) return { success: false, message: '找不到任務！' };

    // 已完成批改的任務不可再修改送出，避免蓋掉教師的評分／評語，除非教師將其退回重修才能重新提交；
    // QUIZ／YOUTUBE 是系統自動批改，不算「教師已批改」，允許重新作答。
    if (task.type !== 'QUIZ' && task.type !== 'YOUTUBE') {
      const existing = getSubmission(payload.taskId, payload.studentId);
      if (existing.success && existing.data && existing.data.status === '已完成') {
        return { success: false, message: '此任務已完成批改，無法再修改送出。如需補交或修改，請洽老師將此任務「退回重修」。' };
      }
    }

    const folderLabel = task.title + '_' + task.id;
    let content = {};
    let status = '待批改';
    let score = null;

    if (task.type === 'LINK' || task.type === 'PDF' || task.type === 'FILE_SHARE') {
      content = { readAt: nowStr() };
      status = '已完成';
    } else if (task.type === 'PHOTO_TEXT') {
      const photoFileIds = [];
      (payload.photos || []).forEach((p, idx) => {
        const r = uploadFile({ base64Data: p.base64, mimeType: p.mimeType, fileName: (payload.studentName || 'student') + '_' + (idx + 1) + '.jpg', folderName: folderLabel, classId: task.classId, categoryId: task.categoryId });
        if (r.success) photoFileIds.push(r.fileId);
      });
      content = { text: payload.text || '', photoFileIds: photoFileIds };
    } else if (task.type === 'DRAWING') {
      const r = uploadFile({ base64Data: payload.base64, mimeType: payload.mimeType || 'image/png', fileName: (payload.studentName || 'student') + '_drawing.png', folderName: folderLabel, classId: task.classId, categoryId: task.categoryId });
      content = { fileId: r.success ? r.fileId : '' };
    } else if (task.type === 'QUIZ' || task.type === 'YOUTUBE') {
      const qRes = getQuizQuestions(task.id);
      const questions = qRes.data || [];
      const answers = payload.answers || [];
      let correct = 0;
      const details = answers.map(a => {
        const q = questions.find(x => x.id === a.questionId);
        const isCorrect = !!q && String(q.answer).toUpperCase() === String(a.selected).toUpperCase();
        if (isCorrect) correct++;
        return {
          questionId: a.questionId, text: q ? q.text : '', options: q ? q.options : [],
          selected: a.selected, correctAnswer: q ? q.answer : '', explanation: q ? q.explanation : '', correct: isCorrect
        };
      });
      const total = questions.length;
      // 沒有題目時（例如純觀看影片、未勾選隨堂考）不應計出 0 分，score 維持 null 代表「無需計分」
      score = total > 0 ? Math.round((correct / total) * 100) : null;
      content = { answers: details, correctCount: correct, total: total, watchedSeconds: Number(payload.watchedSeconds) || 0 };
      // QUIZ／YOUTUBE 為系統自動批改，教師端不再需要人工確認，提交後即直接完成
      status = '已完成';
    }

    const subId = upsertSubmissionRow(task.id, task.classId, payload.studentId, payload.studentName, content, status, score, status === '已完成' && score !== null ? '' : '', '');
    return { success: true, message: '提交成功！', submissionId: subId, status: status, score: score, content: content };
  } catch (err) {
    return { success: false, message: '提交失敗：' + err.toString() };
  }
}

function gradeSubmission(payload) {
  try {
    const sheet = getSheet(SHEETS.SUBMISSIONS);
    const row = findRowIndexById(sheet, payload.submissionId);
    if (row === -1) return { success: false, message: '找不到繳交紀錄！' };
    const status = payload.status || '已完成';
    const gradeCount = Number(sheet.getRange(row, 13).getValue() || 0) + 1;
    sheet.getRange(row, 7).setValue(status);
    sheet.getRange(row, 8).setValue(payload.score === null || payload.score === undefined || payload.score === '' ? '' : Number(payload.score));
    sheet.getRange(row, 9).setValue(payload.level || '');
    sheet.getRange(row, 10).setValue(payload.comment || '');
    sheet.getRange(row, 12).setValue(nowStr());
    sheet.getRange(row, 13).setValue(gradeCount);
    return { success: true, message: status === '退回' ? '已退回給學生重新修改！' : '批改完成！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

/**
 * 批次批改：將同一組分數／等第／評語，一次套用到某任務底下「所有已繳交」的紀錄上
 * （只會更新已存在的繳交紀錄，不會替尚未繳交的學生生成假的繳交資料）。
 */
function bulkGradeSubmissions(taskId, status, score, level, comment) {
  try {
    const sheet = getSheet(SHEETS.SUBMISSIONS);
    const data = sheet.getDataRange().getValues();
    const st = status || '已完成';
    const scoreVal = score === null || score === undefined || score === '' ? '' : Number(score);
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) !== String(taskId)) continue;
      const row = i + 1;
      const gradeCount = Number(data[i][12] || 0) + 1;
      sheet.getRange(row, 7).setValue(st);
      sheet.getRange(row, 8).setValue(scoreVal);
      sheet.getRange(row, 9).setValue(level || '');
      sheet.getRange(row, 10).setValue(comment || '');
      sheet.getRange(row, 12).setValue(nowStr());
      sheet.getRange(row, 13).setValue(gradeCount);
      count++;
    }
    return { success: true, message: `已將這份評分套用到 ${count} 位學生的繳交紀錄！`, count: count };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 學生取得自己在某課堂所有任務的完成狀態（含未提交過的任務，狀態為「未完成」）
function getTasksForStudent(classId, studentId) {
  try {
    const catRes = getCategories(classId);
    const taskRes = getTasks(classId);
    const tasks = (taskRes.data || []).filter(t => t.published);
    const subSheet = getSheet(SHEETS.SUBMISSIONS);
    const subs = sheetToObjects(subSheet, submissionRowToObj).filter(s => s.classId === String(classId) && s.studentId === String(studentId));
    const subMap = {};
    subs.forEach(s => { subMap[s.taskId] = s; });

    const result = tasks.map(t => {
      const sub = subMap[t.id];
      return {
        id: t.id, categoryId: t.categoryId, type: t.type, title: t.title, description: t.description, config: t.config, order: t.order,
        status: sub ? sub.status : '未完成',
        score: sub ? sub.score : null,
        level: sub ? sub.level : '',
        comment: sub ? sub.comment : ''
      };
    });
    return { success: true, categories: catRes.data || [], tasks: result };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 10. PDF / 畫記筆記 =================

function saveAnnotation(payload) {
  try {
    const sheet = getSheet(SHEETS.NOTES);
    const noteId = payload.taskId + '_' + payload.studentId + '_' + payload.page;
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === noteId) {
        sheet.getRange(i + 1, 5).setValue(payload.dataJson);
        sheet.getRange(i + 1, 6).setValue(nowStr());
        return { success: true };
      }
    }
    sheet.appendRow([noteId, payload.taskId, payload.studentId, payload.page, payload.dataJson, nowStr()]);
    return { success: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getAnnotations(taskId, studentId) {
  try {
    const sheet = getSheet(SHEETS.NOTES);
    const data = sheet.getDataRange().getValues();
    const map = {};
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(taskId) && String(data[i][2]) === String(studentId)) {
        map[Number(data[i][3])] = String(data[i][4]);
      }
    }
    return { success: true, data: map };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function getAllAnnotationsForTask(taskId) {
  try {
    const notes = getSheet(SHEETS.NOTES).getDataRange().getValues();
    const students = sheetToObjects(getSheet(SHEETS.STUDENTS), studentRowToObj);
    const nameMap = {};
    students.forEach(s => { nameMap[s.id] = s.name; });
    const byStudent = {};
    for (let i = 1; i < notes.length; i++) {
      if (String(notes[i][1]) === String(taskId)) {
        const sid = String(notes[i][2]);
        if (!byStudent[sid]) byStudent[sid] = { studentName: nameMap[sid] || sid, pages: {} };
        byStudent[sid].pages[Number(notes[i][3])] = String(notes[i][4]);
      }
    }
    return { success: true, data: byStudent };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 11. 作品藝廊（異步展示牆） =================

function getGalleryItems(classId) {
  try {
    const classRes = getClassById(classId);
    if (!classRes.success || !classRes.data.galleryEnabled) return { success: true, data: [], peerInteractionEnabled: false };

    // 僅顯示教師已針對該任務個別「啟用公開到作品藝廊」的任務（每個任務可各自設定不同的公開名稱）
    const tasks = sheetToObjects(getSheet(SHEETS.TASKS), taskRowToObj).filter(t => t.classId === String(classId) && ['PHOTO_TEXT', 'DRAWING'].indexOf(t.type) !== -1 && t.config && t.config.galleryPublished === true);
    const taskMap = {}; tasks.forEach(t => { taskMap[t.id] = t; });

    // 只要任務本身設為公開即顯示，不要求教師已完成批改
    const subs = sheetToObjects(getSheet(SHEETS.SUBMISSIONS), submissionRowToObj)
      .filter(s => s.classId === String(classId) && taskMap[s.taskId]);

    const interactions = sheetToObjects(getSheet(SHEETS.GALLERY), r => ({
      id: String(r[0]), submissionId: String(r[1]), studentId: String(r[2]), studentName: String(r[3]), type: String(r[4]), content: String(r[5] || ''), time: String(r[6] || '')
    }));

    const items = subs.map(s => {
      const t = taskMap[s.taskId];
      const likes = interactions.filter(i => i.submissionId === s.id && i.type === '讚');
      const comments = interactions.filter(i => i.submissionId === s.id && i.type === '留言');
      return {
        submissionId: s.id, taskId: s.taskId, taskTitle: (t.config.galleryLabel || '').trim() || t.title, taskType: t.type,
        studentId: s.studentId, studentName: s.studentName, content: s.content,
        submittedAt: s.submittedAt, likeCount: likes.length, likedBy: likes.map(l => l.studentId),
        comments: comments.map(c => ({ studentName: c.studentName, text: c.content, time: c.time }))
      };
    });
    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return { success: true, data: items, peerInteractionEnabled: classRes.data.peerInteractionEnabled };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 11.5 完全公開的作品藝廊（免登入即可查看，供首頁與分享連結使用） =================

// 首頁的公開作品藝廊：跨所有課堂，只收錄教師已個別設為「完全公開」的任務
function getPublicGalleryItems() {
  try {
    const tasks = sheetToObjects(getSheet(SHEETS.TASKS), taskRowToObj).filter(t => ['PHOTO_TEXT', 'DRAWING'].indexOf(t.type) !== -1 && t.config && t.config.galleryFullyPublic === true);
    const taskMap = {}; tasks.forEach(t => { taskMap[t.id] = t; });

    // 只要任務本身設為完全公開即顯示，不要求教師已完成批改
    const subs = sheetToObjects(getSheet(SHEETS.SUBMISSIONS), submissionRowToObj).filter(s => taskMap[s.taskId]);

    const items = subs.map(s => {
      const t = taskMap[s.taskId];
      return {
        submissionId: s.id, taskId: s.taskId, taskTitle: (t.config.galleryLabel || '').trim() || t.title, taskType: t.type,
        studentName: s.studentName, content: s.content, submittedAt: s.submittedAt
      };
    });
    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return { success: true, data: items };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 分享連結／QR Code 專用：僅回傳單一任務的公開作品，並再次確認該任務確實被設為完全公開
function getPublicGalleryItemsForTask(taskId) {
  try {
    const taskSheet = getSheet(SHEETS.TASKS);
    const row = findRowIndexById(taskSheet, taskId);
    if (row === -1) return { success: false, message: '找不到此任務' };
    const values = taskSheet.getRange(row, 1, 1, taskSheet.getLastColumn()).getValues()[0];
    const task = taskRowToObj(values);
    if (!task.config || task.config.galleryFullyPublic !== true) {
      return { success: false, message: '此作品目前未設定為完全公開' };
    }
    // 只要任務本身設為完全公開即顯示，不要求教師已完成批改
    const subs = sheetToObjects(getSheet(SHEETS.SUBMISSIONS), submissionRowToObj).filter(s => s.taskId === String(taskId));
    const items = subs.map(s => ({
      submissionId: s.id, taskId: s.taskId, taskType: task.type,
      studentName: s.studentName, content: s.content, submittedAt: s.submittedAt
    }));
    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return { success: true, data: { taskTitle: (task.config.galleryLabel || '').trim() || task.title, items: items } };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 教師後台「作品藝廊」管理列表：列出課堂內所有圖文回應／手繪任務（不論是否已公開），
// 附上目前的公開狀態與已繳交的件數（不論是否已批改，公開後都會顯示在藝廊中），供教師快速切換公開程度
function getGalleryManagementData(classId) {
  try {
    const tasks = sheetToObjects(getSheet(SHEETS.TASKS), taskRowToObj).filter(t => t.classId === String(classId) && ['PHOTO_TEXT', 'DRAWING'].indexOf(t.type) !== -1);
    const subs = sheetToObjects(getSheet(SHEETS.SUBMISSIONS), submissionRowToObj).filter(s => s.classId === String(classId));
    const countMap = {};
    subs.forEach(s => { countMap[s.taskId] = (countMap[s.taskId] || 0) + 1; });

    const list = tasks.sort((a, b) => a.order - b.order).map(t => ({
      taskId: t.id, title: t.title, type: t.type,
      galleryLabel: (t.config.galleryLabel || '').trim() || t.title,
      galleryPublished: !!t.config.galleryPublished,
      galleryFullyPublic: !!t.config.galleryFullyPublic,
      completedCount: countMap[t.id] || 0
    }));
    return { success: true, data: list };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// mode: 'off'（不公開）／'class'（公開，僅本班登入學生可見）／'public'（完全公開，免登入即可查看）
function applyGalleryModeToConfig(config, mode) {
  config = config || {};
  config.galleryPublished = (mode === 'class' || mode === 'public');
  config.galleryFullyPublic = (mode === 'public');
  return config;
}

function setTaskGalleryMode(taskId, mode) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    const row = findRowIndexById(sheet, taskId);
    if (row === -1) return { success: false, message: '找不到任務！' };
    let config = {};
    try { config = JSON.parse(sheet.getRange(row, 7).getValue() || '{}'); } catch (e) { config = {}; }
    config = applyGalleryModeToConfig(config, mode);
    sheet.getRange(row, 7).setValue(JSON.stringify(config));
    return { success: true, message: '已更新作品藝廊公開狀態！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function setAllTasksGalleryMode(classId, mode) {
  try {
    const sheet = getSheet(SHEETS.TASKS);
    const data = sheet.getDataRange().getValues();
    let count = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(classId) && ['PHOTO_TEXT', 'DRAWING'].indexOf(String(data[i][3])) !== -1) {
        let config = {};
        try { config = JSON.parse(data[i][6] || '{}'); } catch (e) { config = {}; }
        config = applyGalleryModeToConfig(config, mode);
        sheet.getRange(i + 1, 7).setValue(JSON.stringify(config));
        count++;
      }
    }
    return { success: true, message: `已更新 ${count} 個任務的作品藝廊公開狀態！` };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function toggleLike(payload) {
  try {
    const sheet = getSheet(SHEETS.GALLERY);
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(payload.submissionId) && String(data[i][2]) === String(payload.studentId) && String(data[i][4]) === '讚') {
        sheet.deleteRow(i + 1);
        return { success: true, liked: false };
      }
    }
    sheet.appendRow([genId('GAL'), payload.submissionId, payload.studentId, payload.studentName, '讚', '', nowStr()]);
    return { success: true, liked: true };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

function addComment(payload) {
  try {
    const text = String(payload.text || '').trim();
    if (!text) return { success: false, message: '留言內容不可為空！' };
    const sheet = getSheet(SHEETS.GALLERY);
    sheet.appendRow([genId('GAL'), payload.submissionId, payload.studentId, payload.studentName, '留言', text, nowStr()]);
    return { success: true, message: '留言成功！' };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// ================= 12. 前端載入加速：整合打包 API =================
// google.script.run 每次呼叫都是一次獨立的來回（尤其在 iPad／較慢網路下延遲明顯累加）。
// 以下函式將「進入課堂」「開啟課堂列表」「學生選課堂」等原本需要 2～3 次來回的流程，
// 合併成一次呼叫回傳所有畫面所需資料，並讓前端可以整批預先快取，達到「點了就秒開」的效果。

// 教師端「進入單一課堂」：課堂資訊＋分類＋任務一次回傳（取代 openClass 原本的 3 次 API 呼叫）
function getClassDetailBundle(classId) {
  try {
    const classRes = getClassById(classId);
    if (!classRes.success) return classRes;
    const catRes = getCategories(classId);
    const taskRes = getTasks(classId);
    return { success: true, data: { classInfo: classRes.data, categories: catRes.data || [], tasks: taskRes.data || [] } };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 教師儀表板「課堂列表」進場時使用：一次回傳所有課堂，並附上每個課堂各自的分類與任務，
// 讓前端可以把所有課堂的內容都預先快取起來，之後點入任何一個課堂都不需要再等伺服器。
// 各工作表只讀取一次、於記憶體中依課堂分組，不會因課堂數量而重複讀取試算表。
function getAllClassesWithDetails() {
  try {
    const classes = sheetToObjects(getSheet(SHEETS.CLASSES), classRowToObj).reverse();
    const allCats = sheetToObjects(getSheet(SHEETS.CATEGORIES), categoryRowToObj);
    const allTasks = sheetToObjects(getSheet(SHEETS.TASKS), taskRowToObj);
    const details = {};
    classes.forEach(c => {
      details[c.id] = {
        classInfo: c,
        categories: allCats.filter(x => x.classId === c.id).sort((a, b) => a.order - b.order),
        tasks: allTasks.filter(x => x.classId === c.id).sort((a, b) => a.order - b.order)
      };
    });
    return { success: true, classes: classes, details: details };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 學生端「選擇課堂」進場時使用：一次回傳學生所屬的所有課堂，並附上每堂課的分類／任務完成狀態，
// 讓前端能預先快取，點進任何一堂課都能立即顯示。同樣是每張工作表只讀取一次。
function getAllClassesForStudentWithTasks(studentId) {
  try {
    const classesRes = getClassesForStudent(studentId);
    if (!classesRes.success) return classesRes;
    const classes = classesRes.data;
    const allCats = sheetToObjects(getSheet(SHEETS.CATEGORIES), categoryRowToObj);
    const allTasks = sheetToObjects(getSheet(SHEETS.TASKS), taskRowToObj).filter(t => t.published);
    const allSubs = sheetToObjects(getSheet(SHEETS.SUBMISSIONS), submissionRowToObj).filter(s => s.studentId === String(studentId));
    const details = {};
    classes.forEach(c => {
      const cats = allCats.filter(x => x.classId === c.id).sort((a, b) => a.order - b.order);
      const subMap = {};
      allSubs.filter(s => s.classId === c.id).forEach(s => { subMap[s.taskId] = s; });
      const tasks = allTasks.filter(t => t.classId === c.id).sort((a, b) => a.order - b.order).map(t => {
        const sub = subMap[t.id];
        return {
          id: t.id, categoryId: t.categoryId, type: t.type, title: t.title, description: t.description, config: t.config, order: t.order,
          status: sub ? sub.status : '未完成', score: sub ? sub.score : null, level: sub ? sub.level : '', comment: sub ? sub.comment : ''
        };
      });
      details[c.id] = { success: true, categories: cats, tasks: tasks };
    });
    return { success: true, classes: classes, details: details };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}

// 首頁進場使用：公開作品藝廊＋Web App 網址＋是否已設定教師密碼，一次回傳取代原本三次來回
function getLandingBundle() {
  try {
    return {
      success: true,
      gallery: getPublicGalleryItems(),
      webAppUrl: getWebAppUrl(),
      teacherPasswordSet: !!getSetting('teacherPassword')
    };
  } catch (err) {
    return { success: false, message: err.toString() };
  }
}
