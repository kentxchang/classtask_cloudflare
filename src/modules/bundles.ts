/** 模組：前端載入加速用的整合打包 API（一次回傳整個畫面所需資料） */
import { Ctx, Result, Routes, Row } from '../lib/db';
import { getClassObj, listClasses } from './classes';
import { listCategories } from './categories';
import { listTasks } from './tasks';
import { classesForStudent } from './students';
import { studentTaskList } from './submissions';
import { publicGalleryItems } from './gallery';
import { getSetting } from './auth';

export const routes: Routes = {
  teacher: {
    // 教師端「進入單一課堂」：課堂資訊＋分類＋任務
    getClassDetailBundle(c: Ctx, classId: string): Result {
      const cls = getClassObj(c.db, classId);
      if (!cls) return { success: false, message: '找不到課堂！' };
      return { success: true, data: { classInfo: cls, categories: listCategories(c.db, classId), tasks: listTasks(c.db, classId) } };
    },

    // 教師儀表板：所有課堂及其分類、任務
    getAllClassesWithDetails(c: Ctx): Result {
      const classes = listClasses(c.db);
      const details: Row = {};
      classes.forEach(cls => { details[cls.id] = { classInfo: cls, categories: listCategories(c.db, cls.id), tasks: listTasks(c.db, cls.id) }; });
      return { success: true, classes, details };
    }
  },
  public: {
    // 學生端「選擇課堂」：所屬課堂＋各課堂任務完成狀態
    getAllClassesForStudentWithTasks(c: Ctx, studentId: string): Result {
      const classes = classesForStudent(c.db, studentId);
      const details: Row = {};
      classes.forEach(cls => { details[cls.id] = { success: true, categories: listCategories(c.db, cls.id), tasks: studentTaskList(c.db, cls.id, studentId) }; });
      return { success: true, classes, details };
    },

    // 首頁：公開作品藝廊＋網址＋是否已設定教師密碼
    getLandingBundle(c: Ctx): Result {
      return { success: true, gallery: publicGalleryItems(c.db), webAppUrl: c.origin + '/', teacherPasswordSet: !!getSetting(c.db, 'teacherPassword') };
    }
  }
};
