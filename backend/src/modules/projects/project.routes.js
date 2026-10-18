import { Router } from 'express';
import { validateIdParam, validateSlugParam } from '../../middleware/params.js';
import { validate } from '../../middleware/validate.js';
import { sendList, sendSuccess } from '../../utils/response.js';
import {
  createProject,
  deleteProject,
  getAdminProject,
  getPublicProject,
  listAdminProjects,
  listPublicProjects,
  updateProject,
} from './project.service.js';
import {
  adminProjectListQuerySchema,
  createProjectBodySchema,
  publicProjectListQuerySchema,
  updateProjectBodySchema,
} from './project.validation.js';

/** 공개: GET /projects, GET /projects/:slug (API.md 8.3·8.4). 목록은 검색·필터·정렬·페이지네이션 (API.md 5장). */
export function createPublicProjectRouter() {
  const router = Router();

  router.get('/projects', validate({ query: publicProjectListQuerySchema }), async (req, res) => {
    const { data, meta } = await listPublicProjects(req.validated.query);
    sendList(res, data, meta);
  });

  router.get('/projects/:slug', validateSlugParam, async (req, res) => {
    sendSuccess(res, await getPublicProject(req.params.slug));
  });

  return router;
}

/** 관리자: /admin/projects (API.md 10.2). requireAdmin은 /admin 라우터에서 적용한다. */
export function createAdminProjectRouter({ logger } = {}) {
  const router = Router();

  router.get('/projects', validate({ query: adminProjectListQuerySchema }), async (req, res) => {
    const { data, meta } = await listAdminProjects(req.validated.query);
    sendList(res, data, meta);
  });

  router.get('/projects/:id', validateIdParam, async (req, res) => {
    sendSuccess(res, await getAdminProject(req.params.id));
  });

  router.post('/projects', validate({ body: createProjectBodySchema }), async (req, res) => {
    sendSuccess(res, await createProject(req.validated.body), 201);
  });

  router.patch('/projects/:id', validateIdParam, validate({ body: updateProjectBodySchema }), async (req, res) => {
    sendSuccess(res, await updateProject(req.params.id, req.validated.body));
  });

  router.delete('/projects/:id', validateIdParam, async (req, res) => {
    await deleteProject(req.params.id, { logger });
    res.status(204).end();
  });

  return router;
}
