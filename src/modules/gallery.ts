/** 模組：作品藝廊（班級展示牆、完全公開藝廊、按讚留言） */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { genId, nowStr, parseJson, str } from '../lib/utils';
import { taskRowToObj, getTaskById, listTasks } from './tasks';
import { submissionRowToObj } from './submissions';

const GALLERY_TYPES = ['PHOTO_TEXT', 'DRAWING'];

function galleryTaskMap(db: Db, where: (t: Row) => boolean): Row {
  const map: Row = {};
  db.all(`SELECT * FROM tasks WHERE type IN (${GALLERY_TYPES.map(t => `'${t}'`).join(',')})`).map(taskRowToObj).filter(where).forEach(t => { map[t.id] = t; });
  return map;
}

function label(t: Row): string {
  return str(t.config.galleryLabel).trim() || t.title;
}

export function publicGalleryItems(db: Db): Result {
  const taskMap = galleryTaskMap(db, t => t.config && t.config.galleryFullyPublic === true);
  const items = db.all('SELECT * FROM submissions ORDER BY rowid DESC').map(submissionRowToObj).filter(s => taskMap[s.taskId]).map(s => {
    const t = taskMap[s.taskId];
    return { submissionId: s.id, taskId: s.taskId, taskTitle: label(t), taskType: t.type, studentName: s.studentName, content: s.content, submittedAt: s.submittedAt };
  });
  return { success: true, data: items };
}

function applyGalleryMode(config: any, mode: string): any {
  config = config || {};
  config.galleryPublished = (mode === 'class' || mode === 'public');
  config.galleryFullyPublic = (mode === 'public');
  return config;
}

export const routes: Routes = {
  public: {
    getGalleryItems(c: Ctx, classId: string): Result {
      const cls = c.db.first('SELECT * FROM classes WHERE id = ?', classId);
      if (!cls || !cls.gallery_enabled) return { success: true, data: [], peerInteractionEnabled: false };
      const taskMap = galleryTaskMap(c.db, t => t.classId === str(classId) && t.config && t.config.galleryPublished === true);
      const subs = c.db.all('SELECT * FROM submissions WHERE class_id = ? ORDER BY rowid DESC', classId).map(submissionRowToObj).filter(s => taskMap[s.taskId]);
      const interactions = c.db.all('SELECT * FROM gallery WHERE submission_id IN (SELECT id FROM submissions WHERE class_id = ?) ORDER BY rowid', classId);
      const items = subs.map(s => {
        const t = taskMap[s.taskId];
        const likes = interactions.filter(i => i.submission_id === s.id && i.type === '讚');
        const comments = interactions.filter(i => i.submission_id === s.id && i.type === '留言');
        return {
          submissionId: s.id, taskId: s.taskId, taskTitle: label(t), taskType: t.type,
          studentId: s.studentId, studentName: s.studentName, content: s.content,
          submittedAt: s.submittedAt, likeCount: likes.length, likedBy: likes.map(l => str(l.student_id)),
          comments: comments.map(cm => ({ studentName: str(cm.student_name), text: str(cm.content), time: str(cm.time) }))
        };
      });
      return { success: true, data: items, peerInteractionEnabled: !!cls.peer_enabled };
    },

    getPublicGalleryItems(c: Ctx): Result {
      return publicGalleryItems(c.db);
    },

    // 分享連結／QR Code 專用：僅回傳單一完全公開任務的作品
    getPublicGalleryItemsForTask(c: Ctx, taskId: string): Result {
      const task = getTaskById(c.db, taskId);
      if (!task) return { success: false, message: '找不到此任務' };
      if (!task.config || task.config.galleryFullyPublic !== true) return { success: false, message: '此作品目前未設定為完全公開' };
      const items = c.db.all('SELECT * FROM submissions WHERE task_id = ? ORDER BY rowid DESC', taskId).map(submissionRowToObj).map(s => ({
        submissionId: s.id, taskId: s.taskId, taskType: task.type, studentName: s.studentName, content: s.content, submittedAt: s.submittedAt
      }));
      return { success: true, data: { taskTitle: label(task), items } };
    },

    toggleLike(c: Ctx, payload: any): Result {
      const r = c.db.first("SELECT id FROM gallery WHERE submission_id = ? AND student_id = ? AND type = '讚'", str(payload.submissionId), str(payload.studentId));
      if (r) {
        c.db.run('DELETE FROM gallery WHERE id = ?', r.id);
        return { success: true, liked: false };
      }
      c.db.run("INSERT INTO gallery (id, submission_id, student_id, student_name, type, content, time) VALUES (?,?,?,?,'讚','',?)",
        genId('GAL'), str(payload.submissionId), str(payload.studentId), str(payload.studentName), nowStr());
      return { success: true, liked: true };
    },

    addComment(c: Ctx, payload: any): Result {
      const text = str(payload.text).trim();
      if (!text) return { success: false, message: '留言內容不可為空！' };
      c.db.run("INSERT INTO gallery (id, submission_id, student_id, student_name, type, content, time) VALUES (?,?,?,?,'留言',?,?)",
        genId('GAL'), str(payload.submissionId), str(payload.studentId), str(payload.studentName), text, nowStr());
      return { success: true, message: '留言成功！' };
    }
  },
  teacher: {
    getGalleryManagementData(c: Ctx, classId: string): Result {
      const countMap: Row = {};
      c.db.all('SELECT task_id, COUNT(*) AS c FROM submissions WHERE class_id = ? GROUP BY task_id', classId).forEach(r => { countMap[r.task_id] = Number(r.c); });
      const list = listTasks(c.db, classId).filter(t => GALLERY_TYPES.indexOf(t.type) !== -1).map(t => ({
        taskId: t.id, title: t.title, type: t.type, galleryLabel: label(t),
        galleryPublished: !!t.config.galleryPublished, galleryFullyPublic: !!t.config.galleryFullyPublic,
        completedCount: countMap[t.id] || 0
      }));
      return { success: true, data: list };
    },

    setTaskGalleryMode(c: Ctx, taskId: string, mode: string): Result {
      const r = c.db.first('SELECT config FROM tasks WHERE id = ?', taskId);
      if (!r) return { success: false, message: '找不到任務！' };
      c.db.run('UPDATE tasks SET config = ? WHERE id = ?', JSON.stringify(applyGalleryMode(parseJson(r.config, {}), mode)), taskId);
      return { success: true, message: '已更新作品藝廊公開狀態！' };
    },

    setAllTasksGalleryMode(c: Ctx, classId: string, mode: string): Result {
      const rows = c.db.all(`SELECT id, config FROM tasks WHERE class_id = ? AND type IN (${GALLERY_TYPES.map(t => `'${t}'`).join(',')})`, classId);
      rows.forEach(r => c.db.run('UPDATE tasks SET config = ? WHERE id = ?', JSON.stringify(applyGalleryMode(parseJson(r.config, {}), mode)), r.id));
      return { success: true, message: `已更新 ${rows.length} 個任務的作品藝廊公開狀態！` };
    }
  }
};
