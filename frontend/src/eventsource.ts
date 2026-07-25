// SSE(EventSource) 플랫폼 추상화 — 네이티브(iOS/Android) 기본 구현.
// React Native에는 내장 EventSource가 없어 react-native-sse를 쓴다.
// 웹/데스크톱(Electron)은 브라우저 내장 EventSource를 쓰는 eventsource.web.ts가 Metro에서 스왑된다.
// (타입 정의(SyncHandlers·SyncSource)는 이 파일이 소유 — 웹 구현이 여기서 import한다.)
import RNEventSource from 'react-native-sse';

export interface SyncHandlers {
  /** SSE 프레임의 data 문자열(우리 계약: JSON). ping/rooms_changed 판별은 호출부가 한다. */
  onMessage: (data: string) => void;
  /** 연결 성립(백오프 리셋용). */
  onOpen?: () => void;
  /** 연결 끊김/에러(재연결 예약용). */
  onError?: () => void;
}

export interface SyncSource {
  close(): void;
}

export function createEventSource(
  url: string,
  handlers: SyncHandlers,
): SyncSource {
  // pollingInterval: 0 — 라이브러리 내부 자동 재연결을 끄고, 백오프 재연결을 호출부(sync.ts)가 관리한다.
  const es = new RNEventSource(url, { pollingInterval: 0 });
  es.addEventListener('message', (event) => {
    if (event.type === 'message' && event.data) handlers.onMessage(event.data);
  });
  if (handlers.onOpen) es.addEventListener('open', () => handlers.onOpen?.());
  es.addEventListener('error', () => handlers.onError?.());
  return {
    close: () => {
      es.removeAllEventListeners();
      es.close();
    },
  };
}
