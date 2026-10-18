import express from 'express';
import { requireJsonContentType } from './contentType.js';

/**
 * Content-Type 검사 + 크기 제한이 있는 JSON 파서.
 * 공개 라우터 16KB, 관리자 라우터 256KB (API.md 1장).
 * 크기 초과·파싱 실패는 errorHandler가 413·400으로 변환한다.
 */
export function jsonBody({ limit }) {
  return [requireJsonContentType, express.json({ limit, strict: true })];
}
