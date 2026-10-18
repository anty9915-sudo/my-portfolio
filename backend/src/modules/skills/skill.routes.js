import { Router } from 'express';
import { validateIdParam } from '../../middleware/params.js';
import { validate } from '../../middleware/validate.js';
import { sendList, sendSuccess } from '../../utils/response.js';
import { toAdminSkill, toPublicSkill } from './skill.model.js';
import {
  createSkill,
  deleteSkill,
  getSkill,
  getSkillUsage,
  listAdminSkills,
  listPublicSkills,
  updateSkill,
} from './skill.service.js';
import {
  adminSkillListQuerySchema,
  createSkillBodySchema,
  publicSkillListQuerySchema,
  updateSkillBodySchema,
} from './skill.validation.js';

/** 공개: GET /skills (API.md 8.5) — 전체 반환, category·status 필터만 받는다. */
export function createPublicSkillRouter() {
  const router = Router();

  router.get('/skills', validate({ query: publicSkillListQuerySchema }), async (req, res) => {
    const skills = await listPublicSkills(req.validated.query);
    sendList(res, skills.map(toPublicSkill), { totalItems: skills.length });
  });

  return router;
}

/** 관리자: /admin/skills (API.md 10.3). requireAdmin은 /admin 라우터에서 적용한다. */
export function createAdminSkillRouter() {
  const router = Router();

  router.get('/skills', validate({ query: adminSkillListQuerySchema }), async (req, res) => {
    const skills = await listAdminSkills(req.validated.query);
    sendList(res, skills.map(toAdminSkill), { totalItems: skills.length });
  });

  router.get('/skills/:id', validateIdParam, async (req, res) => {
    const [skill, usage] = await Promise.all([getSkill(req.params.id), getSkillUsage(req.params.id)]);
    sendSuccess(res, { ...toAdminSkill(skill), usage });
  });

  router.post('/skills', validate({ body: createSkillBodySchema }), async (req, res) => {
    sendSuccess(res, toAdminSkill(await createSkill(req.validated.body)), 201);
  });

  router.patch('/skills/:id', validateIdParam, validate({ body: updateSkillBodySchema }), async (req, res) => {
    sendSuccess(res, toAdminSkill(await updateSkill(req.params.id, req.validated.body)));
  });

  router.delete('/skills/:id', validateIdParam, async (req, res) => {
    await deleteSkill(req.params.id);
    res.status(204).end();
  });

  return router;
}
