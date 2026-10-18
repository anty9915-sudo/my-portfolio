import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { getDatabaseTarget } from './config/database.js';
import { createSessionMiddleware, createSessionStore } from './config/session.js';
import { createErrorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { originCheck } from './middleware/originCheck.js';
import { requestId } from './middleware/requestId.js';
import { createApiRouter } from './routes.js';

/**
 * Express 앱을 구성한다. DB 연결과 서버 시작은 server.js가 담당한다.
 * 세션 저장소가 mongoose 연결을 공유하므로 DB 연결 후에 호출한다.
 *
 * @param {{
 *   clientOrigin: string,
 *   trustProxy: boolean | number | string,
 *   sessionSecret: string,
 *   formTokenSecret: string,
 *   visitHashSecret: string,
 *   isProduction: boolean,
 * }} config
 * @param {{
 *   isDbConnected?: () => boolean,
 *   logger?: Pick<Console, 'error'> & Partial<Pick<Console, 'info'>>,
 *   sessionStore?: import('express-session').Store,
 * }} [deps] 테스트용 대체 의존성
 */
export function createApp(config, deps = {}) {
  const app = express();

  app.set('trust proxy', config.trustProxy);
  // 중첩 객체(?a[$ne]=1)를 만들지 않는 파서. Express 5 기본값이지만 명시한다.
  app.set('query parser', 'simple');

  app.use(requestId);
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin, credentials: true }));
  app.use(originCheck(config.clientOrigin));
  app.use(
    createSessionMiddleware({
      secret: config.sessionSecret,
      isProduction: config.isProduction,
      store: deps.sessionStore ?? createSessionStore(getDatabaseTarget()),
    }),
  );

  app.use(
    '/api/v1',
    createApiRouter({
      ...deps,
      isProduction: config.isProduction,
      formTokenSecret: config.formTokenSecret,
      visitHashSecret: config.visitHashSecret,
      clientOrigin: config.clientOrigin,
    }),
  );

  app.use(notFound);
  app.use(createErrorHandler({ logger: deps.logger }));

  return app;
}
