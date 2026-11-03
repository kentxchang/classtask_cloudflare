/**
 * API 路由註冊表：把各模組的函式彙整成「教師專用」與「公開」兩張表。
 * 新增模組時，只要在下方 MODULES 陣列加入即可。
 */
import { Handler, Routes } from '../lib/db';
import { routes as files } from './files';
import { routes as auth } from './auth';
import { routes as classes } from './classes';
import { routes as categories } from './categories';
import { routes as tasks } from './tasks';
import { routes as quiz } from './quiz';
import { routes as students } from './students';
import { routes as submissions } from './submissions';
import { routes as annotations } from './annotations';
import { routes as gallery } from './gallery';
import { routes as bundles } from './bundles';
import { routes as storage } from './storage';

const MODULES: Routes[] = [files, auth, classes, categories, tasks, quiz, students, submissions, annotations, gallery, bundles, storage];

export const TEACHER_ROUTES: Record<string, Handler> = {};
export const PUBLIC_ROUTES: Record<string, Handler> = {};

MODULES.forEach(m => {
  Object.assign(TEACHER_ROUTES, m.teacher || {});
  Object.assign(PUBLIC_ROUTES, m.public || {});
});
