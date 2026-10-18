import { z } from 'zod';
import { isHttpsUrl, optionalEmail, optionalHttpsUrl, optionalText, requiredText } from '../../utils/fields.js';
import { listQuerySchema } from '../../utils/listQuery.js';
import { PROFILE_LINK_TYPES } from './profile.model.js';

const linkSchema = z.strictObject({
  type: z.enum(PROFILE_LINK_TYPES),
  label: requiredText(30),
  url: z.string().trim().max(2048, '2048자 이하여야 합니다.').refine(isHttpsUrl, 'https URL만 허용됩니다.'),
});

/**
 * PUT /admin/profile (API.md 10.1) — 전체 교체.
 * singletonKey·id·createdAt·updatedAt 등 정의되지 않은 필드는 400.
 * 생략한 선택 필드는 서비스에서 기본값으로 초기화한다.
 */
export const profileBodySchema = z.strictObject({
  name: requiredText(50),
  headline: requiredText(100),
  bio: optionalText(3000),
  goals: z.array(requiredText(200)).max(10, '최대 10개까지 입력할 수 있습니다.').optional(),
  email: optionalEmail(),
  avatarUrl: optionalHttpsUrl(),
  resumeUrl: optionalHttpsUrl(),
  links: z.array(linkSchema).max(10, '최대 10개까지 입력할 수 있습니다.').optional(),
});

/** GET /profile: 쿼리 파라미터를 받지 않는다 (알 수 없는 파라미터는 400) */
export const profileQuerySchema = listQuerySchema({}, { paginated: false });
