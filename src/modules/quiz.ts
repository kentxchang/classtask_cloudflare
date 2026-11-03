/** 模組：測驗題目（QUIZ／YOUTUBE 共用） */
import { Ctx, Db, Result, Routes, Row } from '../lib/db';
import { genId, parseCsvLine, str } from '../lib/utils';

function questionRowToObj(r: Row): Row {
  return {
    id: str(r.id), taskId: str(r.task_id), order: Number(r.ord || 0), text: str(r.text),
    options: [str(r.opt_a), str(r.opt_b), str(r.opt_c), str(r.opt_d)],
    answer: str(r.answer) || 'A', explanation: str(r.explanation),
    timestamp: r.ts === null || r.ts === undefined ? null : Number(r.ts)
  };
}

export function listQuestions(db: Db, taskId: string): Row[] {
  return db.all('SELECT * FROM questions WHERE task_id = ? ORDER BY ord, rowid', taskId).map(questionRowToObj);
}

const INSERT_Q = 'INSERT INTO questions (id, task_id, ord, text, opt_a, opt_b, opt_c, opt_d, answer, explanation, ts) VALUES (?,?,?,?,?,?,?,?,?,?,?)';

export const routes: Routes = {
  teacher: {
    getQuizQuestions(c: Ctx, taskId: string): Result {
      return { success: true, data: listQuestions(c.db, taskId) };
    },

    saveQuizQuestion(c: Ctx, q: any): Result {
      const opts = q.options || [];
      const ts = q.timestamp === null || q.timestamp === undefined || q.timestamp === '' ? null : Number(q.timestamp);
      if (q.id && c.db.first('SELECT id FROM questions WHERE id = ?', q.id)) {
        c.db.run('UPDATE questions SET text=?, opt_a=?, opt_b=?, opt_c=?, opt_d=?, answer=?, explanation=?, ts=? WHERE id=?',
          str(q.text), str(opts[0]), str(opts[1]), str(opts[2]), str(opts[3]), str(q.answer), str(q.explanation), ts, q.id);
        return { success: true, message: '題目已更新！' };
      }
      const order = c.db.count('SELECT COUNT(*) AS c FROM questions WHERE task_id = ?', str(q.taskId));
      const id = genId('Q');
      c.db.run(INSERT_Q, id, str(q.taskId), order, str(q.text), str(opts[0]), str(opts[1]), str(opts[2]), str(opts[3]), str(q.answer), str(q.explanation), ts);
      return { success: true, message: '題目已新增！', id };
    },

    // CSV 每行：題幹,選項A,選項B,選項C,選項D,正解(A/B/C/D),詳解(可空),影片時間點秒數(可空)
    batchImportQuizQuestions(c: Ctx, taskId: string, csvText: string): Result {
      try {
        const lines = str(csvText).split(/\r\n|\n/).map(l => l.trim()).filter(l => l.length > 0);
        let order = c.db.count('SELECT COUNT(*) AS c FROM questions WHERE task_id = ?', str(taskId));
        let count = 0;
        c.db.tx(() => {
          lines.forEach(line => {
            const cols = parseCsvLine(line);
            if (cols.length < 6) return;
            if (cols[0] === '題幹' || cols[0] === '題目') return;
            c.db.run(INSERT_Q, genId('Q') + '_' + count, str(taskId), order, cols[0], cols[1] || '', cols[2] || '', cols[3] || '', cols[4] || '',
              String(cols[5] || 'A').toUpperCase(), cols[6] || '', cols[7] === undefined || cols[7] === '' ? null : Number(cols[7]));
            order++; count++;
          });
        });
        return { success: true, message: `成功匯入 ${count} 題！` };
      } catch (err: any) {
        return { success: false, message: '批次匯入失敗：' + err };
      }
    },

    deleteQuizQuestion(c: Ctx, questionId: string): Result {
      if (!c.db.first('SELECT id FROM questions WHERE id = ?', questionId)) return { success: false, message: '找不到題目！' };
      c.db.run('DELETE FROM questions WHERE id = ?', questionId);
      return { success: true, message: '題目已刪除！' };
    }
  },
  public: {
    // 學生作答用：不含正解與詳解
    getQuizQuestionsForStudent(c: Ctx, taskId: string): Result {
      return { success: true, data: listQuestions(c.db, taskId).map(q => ({ id: q.id, order: q.order, text: q.text, options: q.options, timestamp: q.timestamp })) };
    }
  }
};
