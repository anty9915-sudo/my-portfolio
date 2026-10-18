import { Router } from 'express';
import { validateIdParam } from '../../middleware/params.js';
import {
  createRateLimit,
  FORM_TOKEN_RATE_LIMIT,
  INQUIRY_DAILY_RATE_LIMIT,
  INQUIRY_SHORT_RATE_LIMIT,
} from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import { sendList, sendSuccess } from '../../utils/response.js';
import { CURRENT_CONSENT_VERSION } from './consent.js';
import { issueFormToken, verifyFormToken } from './formToken.js';
import { toAdminInquiry, toAdminInquiryListItem } from './inquiry.model.js';
import { deleteInquiry, getInquiry, listInquiries, submitInquiry, updateInquiry } from './inquiry.service.js';
import {
  adminInquiryListQuerySchema,
  formTokenQuerySchema,
  inquiryBodySchema,
  updateInquiryBodySchema,
} from './inquiry.validation.js';
import { isHoneypotFilled } from './spamGuard.js';

/** 정상 접수와 조용한 거부가 똑같이 보내는 응답 (API.md 8.9) */
function sendReceived(res) {
  return sendSuccess(res, { received: true }, 202);
}

/**
 * 조용한 거부(honeypot / too-fast / duplicate)를 사유별 누적 건수로만 기록한다.
 * IP·이메일·문의 내용은 기록하지 않는다 (DESIGN_REVIEW.md 3.1).
 */
function createSilentRejectLogger(logger) {
  const counts = { honeypot: 0, 'too-fast': 0, duplicate: 0 };
  return (reason) => {
    counts[reason] += 1;
    logger.info?.(`[inquiries] 조용한 거부: ${reason} (누적 ${counts[reason]}건)`);
  };
}

/**
 * 공개: GET /inquiries/form-token, POST /inquiries (API.md 8.8·8.9)
 * POST 검사 순서: (전역) Origin·Content-Type·크기 → 빈도 제한 → 허니팟(202) → 필드 검증(400)
 *   → 토큰 서명·형식·만료(400) → 3초 미만(202) → 24시간 내 중복(202) → 저장(202)
 */
export function createPublicInquiryRouter({ formTokenSecret, logger = console }) {
  if (!formTokenSecret) throw new Error('문의 폼 토큰 서명에 formTokenSecret이 필요합니다.');
  const router = Router();
  const rejectSilently = createSilentRejectLogger(logger);

  router.get(
    '/inquiries/form-token',
    createRateLimit(FORM_TOKEN_RATE_LIMIT),
    validate({ query: formTokenQuerySchema }),
    (req, res) => {
      const { formToken, expiresAt } = issueFormToken(formTokenSecret);
      res.set('Cache-Control', 'no-store');
      sendSuccess(res, { formToken, consentVersion: CURRENT_CONSENT_VERSION, expiresAt: expiresAt.toISOString() });
    },
  );

  router.post(
    '/inquiries',
    // 24시간 제한을 먼저 두어 10분 제한에 걸린 시도까지 모두 하루 카운트에 포함한다
    createRateLimit(INQUIRY_DAILY_RATE_LIMIT),
    createRateLimit(INQUIRY_SHORT_RATE_LIMIT),
    (req, res, next) => {
      if (isHoneypotFilled(req.body?.website)) {
        rejectSilently('honeypot');
        return sendReceived(res);
      }
      return next();
    },
    validate({ body: inquiryBodySchema }),
    async (req, res) => {
      const body = req.validated.body;
      const tokenState = verifyFormToken(body.formToken, formTokenSecret);
      if (tokenState === 'invalid' || tokenState === 'expired') {
        throw ApiError.invalidField(
          'formToken',
          tokenState === 'expired'
            ? '폼 토큰이 만료되었습니다. 페이지를 새로고침해 주세요.'
            : '폼 토큰이 올바르지 않습니다. 페이지를 새로고침해 주세요.',
        );
      }
      if (tokenState === 'too-fast') {
        rejectSilently('too-fast');
        return sendReceived(res);
      }
      if ((await submitInquiry(body)) === 'duplicate') rejectSilently('duplicate');
      return sendReceived(res);
    },
  );

  return router;
}

/** 관리자: /admin/inquiries (API.md 11장). requireAdmin은 /admin 라우터에서 적용한다. */
export function createAdminInquiryRouter() {
  const router = Router();

  router.get('/inquiries', validate({ query: adminInquiryListQuerySchema }), async (req, res) => {
    const { items, meta } = await listInquiries(req.validated.query);
    sendList(res, items.map(toAdminInquiryListItem), meta);
  });

  router.get('/inquiries/:id', validateIdParam, async (req, res) => {
    sendSuccess(res, toAdminInquiry(await getInquiry(req.params.id)));
  });

  router.patch('/inquiries/:id', validateIdParam, validate({ body: updateInquiryBodySchema }), async (req, res) => {
    sendSuccess(res, toAdminInquiry(await updateInquiry(req.params.id, req.validated.body)));
  });

  router.delete('/inquiries/:id', validateIdParam, async (req, res) => {
    await deleteInquiry(req.params.id);
    res.status(204).end();
  });

  return router;
}
