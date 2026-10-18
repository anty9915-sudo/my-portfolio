import mongoose from 'mongoose';
import { ApiError } from '../../utils/ApiError.js';
import { buildSort, dateRangeFilter, searchFilter } from '../../utils/listQuery.js';
import { paginate } from '../../utils/pagination.js';
import { CURRENT_CONSENT_VERSION } from './consent.js';
import { Inquiry, INQUIRY_ADMIN_SORT, INQUIRY_RETENTION_MS } from './inquiry.model.js';
import { INQUIRY_SEARCH_FIELDS } from './inquiry.validation.js';
import { computeContentHash } from './spamGuard.js';

const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 검증·토큰 확인을 통과한 문의를 저장한다.
 * 24시간 안에 같은 contentHash가 있으면 저장하지 않는다 (시간 조건이 있어 unique 인덱스로 막지 않으므로,
 * 완전히 같은 내용이 동시에 제출되면 둘 다 저장될 수 있다).
 * @returns {Promise<'saved' | 'duplicate'>}
 */
export async function submitInquiry(body, now = Date.now()) {
  const contentHash = computeContentHash(body.email, body.message);
  const recent = await Inquiry.exists({
    contentHash,
    createdAt: mongoose.trusted({ $gte: new Date(now - DUPLICATE_WINDOW_MS) }),
  });
  if (recent) return 'duplicate';

  const receivedAt = new Date(now);
  await Inquiry.create({
    name: body.name,
    email: body.email,
    subject: body.subject ?? null,
    message: body.message,
    consent: { agreed: true, version: CURRENT_CONSENT_VERSION, agreedAt: receivedAt },
    contentHash,
    createdAt: receivedAt,
    expiresAt: new Date(now + INQUIRY_RETENTION_MS),
  });
  return 'saved';
}

// 관리자

export function listInquiries(query) {
  const filter = {};
  if (query.status) filter.status = query.status;
  const createdAt = dateRangeFilter(query.from, query.to);
  if (createdAt) filter.createdAt = createdAt;
  return paginate(Inquiry, {
    filter: { ...filter, ...searchFilter(query.q, INQUIRY_SEARCH_FIELDS) },
    sort: buildSort(query.sort, INQUIRY_ADMIN_SORT),
    page: query.page,
    limit: query.limit,
  });
}

/** 조회만으로 status를 바꾸지 않는다 (API.md 11.2) */
export async function getInquiry(id) {
  const inquiry = await Inquiry.findById(id).lean();
  if (!inquiry) throw ApiError.notFound();
  return inquiry;
}

/**
 * status·adminMemo만 수정한다 (API.md 11.3). 처리 시각 규칙:
 *  - 처음 read가 되면 readAt 기록
 *  - 처음 replied가 되면 repliedAt 기록, readAt이 비어 있으면 함께 기록 (회신은 읽음을 포함)
 *  - archived는 새 시각을 기록하지 않고, new로 되돌려도 기존 시각은 유지
 */
export async function updateInquiry(id, body, now = new Date()) {
  const inquiry = await Inquiry.findById(id);
  if (!inquiry) throw ApiError.notFound();

  if ('adminMemo' in body) inquiry.adminMemo = body.adminMemo;
  if (body.status) {
    inquiry.status = body.status;
    if ((body.status === 'read' || body.status === 'replied') && !inquiry.readAt) inquiry.readAt = now;
    if (body.status === 'replied' && !inquiry.repliedAt) inquiry.repliedAt = now;
  }
  await inquiry.save();
  return inquiry.toObject();
}

/** 보관 기간과 관계없이 즉시 물리 삭제 (API.md 11.4) */
export async function deleteInquiry(id) {
  const deleted = await Inquiry.findByIdAndDelete(id);
  if (!deleted) throw ApiError.notFound();
}
