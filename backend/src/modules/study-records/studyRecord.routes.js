import { Router } from 'express';
import { validateIdParam, validateSlugParam } from '../../middleware/params.js';
import { validate } from '../../middleware/validate.js';
import { sendList, sendSuccess } from '../../utils/response.js';
import {
  createStudyRecord,
  deleteStudyRecord,
  getAdminStudyRecord,
  getPublicStudyRecord,
  listAdminStudyRecords,
  listPublicStudyRecords,
  updateStudyRecord,
} from './studyRecord.service.js';
import {
  adminStudyRecordListQuerySchema,
  createStudyRecordBodySchema,
  publicStudyRecordListQuerySchema,
  updateStudyRecordBodySchema,
} from './studyRecord.validation.js';

/** 공개: GET /study-records, GET /study-records/:slug (API.md 8.6·8.7). 목록은 검색·필터·정렬·페이지네이션 (API.md 5장). */
export function createPublicStudyRecordRouter() {
  const router = Router();

  router.get('/study-records', validate({ query: publicStudyRecordListQuerySchema }), async (req, res) => {
    const { data, meta } = await listPublicStudyRecords(req.validated.query);
    sendList(res, data, meta);
  });

  router.get('/study-records/:slug', validateSlugParam, async (req, res) => {
    sendSuccess(res, await getPublicStudyRecord(req.params.slug));
  });

  return router;
}

/** 관리자: /admin/study-records (API.md 10.4). requireAdmin은 /admin 라우터에서 적용한다. */
export function createAdminStudyRecordRouter() {
  const router = Router();

  router.get('/study-records', validate({ query: adminStudyRecordListQuerySchema }), async (req, res) => {
    const { data, meta } = await listAdminStudyRecords(req.validated.query);
    sendList(res, data, meta);
  });

  router.get('/study-records/:id', validateIdParam, async (req, res) => {
    sendSuccess(res, await getAdminStudyRecord(req.params.id));
  });

  router.post('/study-records', validate({ body: createStudyRecordBodySchema }), async (req, res) => {
    sendSuccess(res, await createStudyRecord(req.validated.body), 201);
  });

  router.patch(
    '/study-records/:id',
    validateIdParam,
    validate({ body: updateStudyRecordBodySchema }),
    async (req, res) => {
      sendSuccess(res, await updateStudyRecord(req.params.id, req.validated.body));
    },
  );

  router.delete('/study-records/:id', validateIdParam, async (req, res) => {
    await deleteStudyRecord(req.params.id);
    res.status(204).end();
  });

  return router;
}
