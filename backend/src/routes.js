import { Router } from 'express';
import { jsonBody } from './middleware/jsonBody.js';
import { createRateLimit, PUBLIC_READ_RATE_LIMIT } from './middleware/rateLimit.js';
import { createRequireAdmin } from './middleware/requireAdmin.js';
import { createAuthRouter } from './modules/auth/auth.routes.js';
import { createHealthRouter } from './modules/health/health.routes.js';
import { createAdminInquiryRouter, createPublicInquiryRouter } from './modules/inquiries/inquiry.routes.js';
import { createAdminStatsRouter, createPublicVisitRouter } from './modules/visits/visit.routes.js';
import { createAdminProfileRouter, createPublicProfileRouter } from './modules/profile/profile.routes.js';
import { createAdminProjectRouter, createPublicProjectRouter } from './modules/projects/project.routes.js';
import { createAdminSkillRouter, createPublicSkillRouter } from './modules/skills/skill.routes.js';
import {
  createAdminStudyRecordRouter,
  createPublicStudyRecordRouter,
} from './modules/study-records/studyRecord.routes.js';

const PUBLIC_BODY_LIMIT = '16kb';
const ADMIN_BODY_LIMIT = '256kb';
const PUBLIC_READ_PATHS = ['/profile', '/skills', '/projects', '/study-records'];

/**
 * /admin 라우터: 모든 경로에 requireAdmin (API.md 4장).
 * 인증을 먼저 확인해 로그인하지 않은 요청의 본문은 파싱하지 않는다.
 */
function createAdminRouter({ isProduction, logger }) {
  const admin = Router();
  admin.use(createRequireAdmin({ isProduction }));
  admin.use(jsonBody({ limit: ADMIN_BODY_LIMIT }));
  admin.use(createAdminProfileRouter());
  admin.use(createAdminSkillRouter());
  admin.use(createAdminProjectRouter({ logger }));
  admin.use(createAdminStudyRecordRouter());
  admin.use(createAdminInquiryRouter());
  admin.use(createAdminStatsRouter());
  return admin;
}

/**
 * /api/v1 라우터.
 * 관리자 라우터(본문 256KB)는 공개 라우터의 16KB 파서를 거치지 않도록 공개 라우터보다 먼저 연결한다.
 *
 * @param {{
 *   isProduction: boolean,
 *   formTokenSecret: string,
 *   visitHashSecret: string,
 *   clientOrigin: string,
 *   isDbConnected?: () => boolean,
 *   logger?: Pick<Console, 'error'> & Partial<Pick<Console, 'info'>>,
 * }} deps
 */
export function createApiRouter(deps) {
  const api = Router();

  api.use('/admin', createAdminRouter({ isProduction: deps.isProduction, logger: deps.logger }));

  const publicRouter = Router();
  publicRouter.use(jsonBody({ limit: PUBLIC_BODY_LIMIT }));
  publicRouter.use(createHealthRouter(deps));
  publicRouter.use(createAuthRouter({ isProduction: deps.isProduction }));
  // 공개 콘텐츠 조회: IP당 1분 120회 (API.md 6장). 헬스 체크·인증은 제외.
  publicRouter.use(PUBLIC_READ_PATHS, createRateLimit(PUBLIC_READ_RATE_LIMIT));
  publicRouter.use(createPublicProfileRouter());
  publicRouter.use(createPublicSkillRouter());
  publicRouter.use(createPublicProjectRouter());
  publicRouter.use(createPublicStudyRecordRouter());
  // 문의: 경로별 빈도 제한(폼 토큰 10분 20회, 접수 10분 3회·24시간 10회)을 라우터 안에서 적용
  publicRouter.use(createPublicInquiryRouter({ formTokenSecret: deps.formTokenSecret, logger: deps.logger }));
  // 방문 기록: 1분 60회 제한을 라우터 안에서 적용
  publicRouter.use(
    createPublicVisitRouter({ visitHashSecret: deps.visitHashSecret, clientOrigin: deps.clientOrigin }),
  );

  api.use(publicRouter);
  return api;
}
