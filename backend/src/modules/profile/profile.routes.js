import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { sendSuccess } from '../../utils/response.js';
import { toAdminProfile, toPublicProfile } from './profile.model.js';
import { getProfile, replaceProfile } from './profile.service.js';
import { profileBodySchema, profileQuerySchema } from './profile.validation.js';

/** 공개: GET /profile (API.md 8.2) */
export function createPublicProfileRouter() {
  const router = Router();

  router.get('/profile', validate({ query: profileQuerySchema }), async (req, res) => {
    sendSuccess(res, toPublicProfile(await getProfile()));
  });

  return router;
}

/** 관리자: PUT /admin/profile (API.md 10.1). requireAdmin은 /admin 라우터에서 적용한다. */
export function createAdminProfileRouter() {
  const router = Router();

  router.put('/profile', validate({ body: profileBodySchema }), async (req, res) => {
    const { profile, created } = await replaceProfile(req.validated.body);
    sendSuccess(res, toAdminProfile(profile), created ? 201 : 200);
  });

  return router;
}
