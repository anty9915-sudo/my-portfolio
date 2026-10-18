import { z } from 'zod';
import { optionalText, requiredEmail, requiredText, toPatchSchema } from '../../utils/fields.js';
import { dateParam, enumParam, listQuerySchema, searchParam } from '../../utils/listQuery.js';
import { CURRENT_CONSENT_VERSION } from './consent.js';
import { INQUIRY_STATUSES } from './inquiry.model.js';
import { countUrls, MAX_URLS_IN_MESSAGE } from './spamGuard.js';

/**
 * POST /inquiries (API.md 8.9). 허니팟은 이 검증보다 먼저 별도로 확인하므로,
 * 여기까지 온 요청의 website는 비어 있다. 오류 메시지에 입력값을 담지 않는다.
 */
export const inquiryBodySchema = z.strictObject({
  name: requiredText(50),
  email: requiredEmail(),
  subject: optionalText(100),
  message: requiredText(3000, 10).refine(
    (message) => countUrls(message) <= MAX_URLS_IN_MESSAGE,
    `URL은 최대 ${MAX_URLS_IN_MESSAGE}개까지 포함할 수 있습니다.`,
  ),
  consent: z.literal(true, '개인정보 수집·이용에 동의해야 합니다.'),
  consentVersion: z
    .string('동의 문구 버전이 필요합니다.')
    .refine((version) => version === CURRENT_CONSENT_VERSION, '동의 문구 버전이 현재 버전과 다릅니다. 페이지를 새로고침해 주세요.'),
  formToken: z.string('폼 토큰이 필요합니다.').min(1, '폼 토큰이 필요합니다.'),
  website: z.literal('').nullable().optional(), // 허니팟 (화면에 숨김, 저장하지 않음)
});

/** GET /inquiries/form-token: 쿼리 파라미터를 받지 않는다 */
export const formTokenQuerySchema = listQuerySchema({}, { paginated: false });

// 관리자 (API.md 5.5, 11장)
export const INQUIRY_SEARCH_FIELDS = ['name', 'email', 'subject'];

/** GET /admin/inquiries: q(이름·이메일·제목), status, from·to(접수일, KST), sort=createdAt */
export const adminInquiryListQuerySchema = listQuerySchema(
  { q: searchParam(), status: enumParam(INQUIRY_STATUSES), from: dateParam(), to: dateParam() },
  { sortFields: ['createdAt'], dateRange: true },
);

/** PATCH /admin/inquiries/:id: status·adminMemo만 (문의자 입력 필드와 처리 시각은 수정 불가) */
export const updateInquiryBodySchema = toPatchSchema({
  status: z.enum(INQUIRY_STATUSES),
  adminMemo: optionalText(1000),
});
