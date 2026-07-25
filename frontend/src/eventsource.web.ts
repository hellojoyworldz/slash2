// SSE(EventSource) 플랫폼 추상화 — 웹/데스크톱(Electron) 구현.
// 브라우저 내장 EventSource를 쓴다. 헤더를 실을 수 없어 인증은 URL 쿼리(?token=)로 전달한다.
// 타입은 네이티브 기본 파일(eventsource.ts)이 소유 — 여기서 import해 재사용한다.
import type { SyncHandlers, SyncSource } from './eventsource';

export type { SyncHandlers, SyncSource } from './eventsource';

export function createEventSource(
  url: string,
  handlers: SyncHandlers,
): SyncSource {
  const es = new EventSource(url);
  es.addEventListener('message', (event) => {
    const data = (event as MessageEvent).data;
    if (typeof data === 'string') handlers.onMessage(data);
  });
  if (handlers.onOpen) es.addEventListener('open', () => handlers.onOpen?.());
  // 브라우저 EventSource는 끊기면 스스로 재연결을 시도하지만, 통합 백오프 제어를 위해
  // 호출부(sync.ts)가 error에서 close() 후 재연결을 예약한다.
  es.addEventListener('error', () => handlers.onError?.());
  return { close: () => es.close() };
}
