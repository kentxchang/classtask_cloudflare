/**
 * 模組：學生提交任務與教師批改
 * 各任務類型的「提交方式」集中在 SUBMIT_HANDLERS，新增任務類型時只要在這裡加一個處理函式。
 */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { cleanCellText, FILE_ID_RE, genId, nowStr, parseJson, str } from '../lib/utils';
import { deleteFiles, saveFile } from './files';
import { getTaskById, listTasks } from './tasks';
import { listQuestions } from './quiz';
import { listCategories } from './categories';
import { enrolledStudents } from './students';

export function submissionRowToObj(r: Row): Row {
  const scoreRaw = cleanCellText(r.score);
  return {
    id: str(r.id), taskId: str(r.task_id), classId: str(r.class_id), studentId: str(r.student_id),
    studentName: str(r.student_name), content: parseJson(r.content, {}), status: str(r.status),
    score: scoreRaw === '' ? null : Number(scoreRaw), level: cleanCellText(r.level), comment: cleanCellText(r.comment),
    submittedAt: str(r.submitted_at), gradedAt: str(r.graded_at), gradeCount: Number(r.grade_count || 0)
  };
}

export function findSubmission(db: Db, taskId: string, studentId: string): Row | null {
  const r = db.first('SELECT * FROM submissions WHERE task_id = ? AND student_id = ? ORDER BY rowid DESC LIMIT 1', str(taskId), str(studentId));
  return r ? submissionRowToObj(r) : null;
}

function upsertSubmissionRow(db: Db, taskId: string, classId: string, studentId: string, studentName: string, content: any, status: string, score: number | null): string {
  const existing = db.first('SELECT id, grade_count FROM submissions WHERE task_id = ? AND student_id = ? ORDER BY rowid LIMIT 1', taskId, studentId);
  if (existing) {
    const gradeCount = status === '待批改' ? Number(existing.grade_count || 0) : Number(existing.grade_count || 0) + 1;
    db.run('UPDATE submissions SET content=?, status=?, score=?, level=?, comment=?, submitted_at=?, graded_at=?, grade_count=? WHERE id=?',
      JSON.stringify(content), status, score, '', '', nowStr(), status === '待批改' ? '' : nowStr(), gradeCount, existing.id);
    return str(existing.id);
  }
  const id = genId('SUB');
  db.run('INSERT INTO submissions (id, task_id, class_id, student_id, student_name, content, status, score, level, comment, submitted_at, graded_at, grade_count) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)',
    id, taskId, classId, studentId, str(studentName), JSON.stringify(content), status, score, '', '', nowStr(), status === '待批改' ? '' : nowStr());
  return id;
}

// ---------- 各任務類型的提交處理 ----------
type SubmitOutcome = { content: any; status: string; score: number | null };
type SubmitHandler = (db: Db, task: Row, payload: any) => SubmitOutcome;

// 閱讀類任務：按下「標記已完成」即完成
const markRead: SubmitHandler = () => ({ content: { readAt: nowStr() }, status: '已完成', score: null });

// 單張圖片回傳（手繪作品、HTML 截圖），等待教師批改
const singleImage = (suffix: string): SubmitHandler => (db, task, payload) => ({
  content: { fileId: payload.base64 ? saveFile(db, payload.base64, payload.mimeType || 'image/jpeg', (payload.studentName || 'student') + suffix, task.classId) : '' },
  status: '待批改',
  score: null
});

// QUIZ／YOUTUBE 系統自動批改
const autoGrade: SubmitHandler = (db, task, payload) => {
  const questions = listQuestions(db, task.id);
  let correct = 0;
  const details = (payload.answers || []).map((a: any) => {
    const q = questions.find(x => x.id === a.questionId);
    const isCorrect = !!q && String(q.answer).toUpperCase() === String(a.selected).toUpperCase();
    if (isCorrect) correct++;
    return {
      questionId: a.questionId, text: q ? q.text : '', options: q ? q.options : [],
      selected: a.selected, correctAnswer: q ? q.answer : '', explanation: q ? q.explanation : '', correct: isCorrect
    };
  });
  const total = questions.length;
  return {
    content: { answers: details, correctCount: correct, total, watchedSeconds: Number(payload.watchedSeconds) || 0 },
    status: '已完成',
    // 沒有題目時（例如純觀看影片）不計分
    score: total > 0 ? Math.round((correct / total) * 100) : null
  };
};

export const SUBMIT_HANDLERS: Record<string, SubmitHandler> = {
  LINK: markRead,
  PDF: markRead,
  FILE_SHARE: markRead,
  MARKDOWN: markRead,
  PHOTO_TEXT: (db, task, payload) => ({
    content: {
      text: payload.text || '',
      photoFileIds: (payload.photos || []).map((p: any, idx: number) =>
        saveFile(db, p.base64, p.mimeType || 'image/jpeg', (payload.studentName || 'student') + '_' + (idx + 1) + '.jpg', task.classId))
    },
    status: '待批改',
    score: null
  }),
  DRAWING: singleImage('_drawing.jpg'),
  HTML_SHARE: singleImage('_html_screenshot.jpg'),
  QUIZ: autoGrade,
  YOUTUBE: autoGrade
};

// 系統自動批改的類型可重複作答；其餘類型教師批改完成後即鎖定
const RESUBMIT_ALWAYS = ['QUIZ', 'YOUTUBE'];

export function studentTaskList(db: Db, classId: string, studentId: string): Row[] {
  const subMap: Row = {};
  db.all('SELECT * FROM submissions WHERE class_id = ? AND student_id = ? ORDER BY rowid', classId, studentId)
    .map(submissionRowToObj).forEach(s => { subMap[s.taskId] = s; });
  return listTasks(db, classId).filter(t => t.published).map(t => {
    const sub = subMap[t.id];
    return {
      id: t.id, categoryId: t.categoryId, type: t.type, title: t.title, description: t.description, config: t.config, order: t.order,
      status: sub ? sub.status : '未完成', score: sub ? sub.score : null, level: sub ? sub.level : '', comment: sub ? sub.comment : ''
    };
  });
}

export const routes: Routes = {
  public: {
    getSubmission(c: Ctx, taskId: string, studentId: string): Result {
      return { success: true, data: findSubmission(c.db, taskId, studentId) };
    },

    getTasksForStudent(c: Ctx, classId: string, studentId: string): Result {
      return { success: true, categories: listCategories(c.db, classId), tasks: studentTaskList(c.db, classId, studentId) };
    },

    submitTask(c: Ctx, payload: any): Result {
      try {
        const task = getTaskById(c.db, payload.taskId);
        if (!task || task.classId !== str(payload.classId)) return { success: false, message: '找不到任務！' };
        const handler = SUBMIT_HANDLERS[task.type];
        if (!handler) return { success: false, message: '此任務類型不支援提交！' };

        const existing = findSubmission(c.db, payload.taskId, payload.studentId);
        if (RESUBMIT_ALWAYS.indexOf(task.type) === -1 && existing && existing.status === '已完成') {
          return { success: false, message: '此任務已完成批改，無法再修改送出。如需補交或修改，請洽老師將此任務「退回重修」。' };
        }

        const out = handler(c.db, task, payload);
        const subId = upsertSubmissionRow(c.db, task.id, task.classId, payload.studentId, payload.studentName, out.content, out.status, out.score);

        // 重新繳交時，舊作品中已不再使用的圖片直接刪除以節省空間
        if (existing) {
          const newContent = JSON.stringify(out.content);
          const oldIds = JSON.stringify(existing.content || {}).match(FILE_ID_RE) || [];
          deleteFiles(c.db, oldIds.filter(id => newContent.indexOf(id) === -1));
        }
        return { success: true, message: '提交成功！', submissionId: subId, status: out.status, score: out.score, content: out.content };
      } catch (err: any) {
        return { success: false, message: '提交失敗：' + err };
      }
    }
  },
  teacher: {
    getSubmissionsForTask(c: Ctx, taskId: string): Result {
      return { success: true, data: c.db.all('SELECT * FROM submissions WHERE task_id = ? ORDER BY rowid', taskId).map(submissionRowToObj) };
    },

    // 全班進度總覽矩陣：{ students, tasks, matrix:{studentId:{taskId:submission}} }
    getClassOverview(c: Ctx, classId: string): Result {
      const students = enrolledStudents(c.db, classId);
      const matrix: Row = {};
      students.forEach(s => { matrix[s.id] = {}; });
      c.db.all('SELECT * FROM submissions WHERE class_id = ? ORDER BY rowid', classId).map(submissionRowToObj).forEach(sub => {
        if (!matrix[sub.studentId]) matrix[sub.studentId] = {};
        matrix[sub.studentId][sub.taskId] = sub;
      });
      return {
        success: true,
        data: {
          students: students.map(s => ({ id: s.id, name: s.name })),
          tasks: listTasks(c.db, classId).map(t => ({ id: t.id, title: t.title, type: t.type, categoryId: t.categoryId })),
          matrix
        }
      };
    },

    gradeSubmission(c: Ctx, payload: any): Result {
      const r = c.db.first('SELECT grade_count FROM submissions WHERE id = ?', payload.submissionId);
      if (!r) return { success: false, message: '找不到繳交紀錄！' };
      const status = payload.status || '已完成';
      const score = payload.score === null || payload.score === undefined || payload.score === '' ? null : Number(payload.score);
      c.db.run('UPDATE submissions SET status=?, score=?, level=?, comment=?, graded_at=?, grade_count=? WHERE id=?',
        status, score, str(payload.level), str(payload.comment), nowStr(), Number(r.grade_count || 0) + 1, payload.submissionId);
      return { success: true, message: status === '退回' ? '已退回給學生重新修改！' : '批改完成！' };
    },

    // 批次批改：同一組評分套用到某任務所有已繳交的紀錄
    bulkGradeSubmissions(c: Ctx, taskId: string, status: string, score: any, level: string, comment: string): Result {
      const scoreVal = score === null || score === undefined || score === '' ? null : Number(score);
      const count = c.db.count('SELECT COUNT(*) AS c FROM submissions WHERE task_id = ?', taskId);
      c.db.run('UPDATE submissions SET status=?, score=?, level=?, comment=?, graded_at=?, grade_count=COALESCE(grade_count,0)+1 WHERE task_id=?',
        status || '已完成', scoreVal, str(level), str(comment), nowStr(), taskId);
      return { success: true, message: `已將這份評分套用到 ${count} 位學生的繳交紀錄！`, count };
    }
  }
};
