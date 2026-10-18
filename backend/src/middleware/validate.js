import { ApiError } from '../utils/ApiError.js';

const PARTS = ['params', 'query', 'body'];

export function issuesToDetails(issues) {
  return issues.flatMap((issue) => {
    const prefix = issue.path.join('.');
    // 정의되지 않은 필드는 키마다 하나씩 알려 준다 (Zod 기본은 경로 없이 한 건)
    if (issue.code === 'unrecognized_keys' && Array.isArray(issue.keys)) {
      return issue.keys.map((key) => ({ field: prefix ? `${prefix}.${key}` : key, reason: '정의되지 않은 필드입니다.' }));
    }
    return [{ field: prefix || '(root)', reason: issue.message }];
  });
}

/**
 * Zod 스키마로 요청을 검증한다. 검증된 값은 `req.validated`에 담는다.
 * (Express 5에서는 req.query를 다시 대입할 수 없으므로 원본은 건드리지 않는다.)
 *
 * @param {{ params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType }} schemas
 */
export function validate(schemas) {
  return function validateRequest(req, res, next) {
    const validated = {};
    const details = [];

    for (const part of PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        validated[part] = result.data;
      } else {
        details.push(...issuesToDetails(result.error.issues));
      }
    }

    if (details.length > 0) return next(ApiError.validation(details));
    req.validated = validated;
    return next();
  };
}
