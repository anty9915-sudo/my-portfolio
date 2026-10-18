import { runRollup } from './rollup.js';

export const ROLLUP_INTERVAL_MS = 60 * 60 * 1000; // 1시간

/**
 * 일별 집계 스케줄러 (DATABASE.md 4.8, DESIGN_REVIEW.md U-15). 추가 라이브러리 없이 setInterval을 쓴다.
 * - 시작하자마자 한 번 실행해, 서버가 꺼져 있던 동안 빠진 날짜도 원본이 남아 있으면 채운다.
 * - 이후 1시간마다 실행한다. 실행이 겹치면 진행 중인 실행을 함께 기다린다 (runRollup).
 * - 실패해도 서버를 멈추지 않고 오류 로그만 남긴 뒤 다음 주기에 다시 시도한다.
 * server.js에서만 시작한다 (createApp은 스케줄러를 켜지 않는다).
 *
 * @returns {{ ready: Promise<void>, stop: () => void }}
 */
export function startRollupScheduler({
  intervalMs = ROLLUP_INTERVAL_MS,
  logger = console,
  run = () => runRollup(Date.now()),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const tick = async () => {
    try {
      const filled = await run();
      if (filled?.length) logger.info?.(`[visits] 일별 집계 완료: ${filled.length}일`);
    } catch (error) {
      logger.error?.('[visits] 일별 집계 실패 (다음 주기에 다시 시도)', error);
    }
  };

  const ready = tick();
  const timer = setIntervalFn(tick, intervalMs);
  timer?.unref?.(); // 타이머만으로 프로세스가 살아 있지 않게 한다

  return {
    ready,
    stop() {
      clearIntervalFn(timer);
    },
  };
}
