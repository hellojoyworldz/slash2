import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { BASE_URL } from './api';
import { useAuth } from './auth';
import { createEventSource, SyncSource } from './eventsource';
import { useSelectedRoom } from './selected-room';

// 기기 간 실시간 동기화 클라이언트.
// 로그인 상태에서 백엔드 SSE(GET /events)에 연결해 rooms_changed 이벤트를 받고,
// 받으면 목록 화면(bumpRooms)과 열린 상세 화면(bumpSync)을 조용히 재조회하게 신호를 낸다.
// 웹/데스크톱은 브라우저 EventSource, 네이티브는 react-native-sse — eventsource(.web).ts가 감싼다.

const isWeb = Platform.OS === 'web';
const BASE_BACKOFF_MS = 1_000; // 첫 재연결 지연
const MAX_BACKOFF_MS = 30_000; // 재연결 지연 상한
const COALESCE_MS = 300; // 이벤트 폭주를 한 번의 재조회로 묶는 창

export function useRealtimeSync(): void {
  const { token } = useAuth();
  const { bumpRooms, bumpSync } = useSelectedRoom();

  // bump 함수를 ref로 잡아, 함수 정체성이 바뀌어도 연결을 재설정하지 않는다(연결은 token에만 의존).
  const bumpRoomsRef = useRef(bumpRooms);
  bumpRoomsRef.current = bumpRooms;
  const bumpSyncRef = useRef(bumpSync);
  bumpSyncRef.current = bumpSync;

  useEffect(() => {
    if (!token) return;

    let source: SyncSource | null = null;
    let closed = false; // effect cleanup 여부(비동기 콜백 가드)
    let connected = false; // 현재 연결이 살아 있는지(포커스 재연결 판단)
    let attempt = 0; // 연속 실패 횟수(지수 백오프)
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let coalesceTimer: ReturnType<typeof setTimeout> | null = null;

    const url = `${BASE_URL}/events?token=${encodeURIComponent(token)}`;

    // 이벤트를 300ms로 코얼레싱 — 짧은 시간에 여러 변이가 와도 재조회는 한 번만.
    const scheduleFlush = () => {
      if (coalesceTimer) return;
      coalesceTimer = setTimeout(() => {
        coalesceTimer = null;
        bumpRoomsRef.current(); // 목록 화면들 재조회(채팅/분류/태그 등)
        bumpSyncRef.current(); // 열린 상세 화면(채팅/보드) 조용히 재조회
      }, COALESCE_MS);
    };

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (closed) return;
      clearReconnect();
      if (source) {
        source.close();
        source = null;
      }
      connected = false;
      source = createEventSource(url, {
        onOpen: () => {
          attempt = 0; // 성공 → 백오프 리셋
          connected = true;
        },
        onMessage: (data) => {
          // keepalive(ping)는 무시하고 rooms_changed만 재조회 트리거.
          try {
            const parsed = JSON.parse(data) as { type?: string };
            if (parsed?.type === 'rooms_changed') scheduleFlush();
          } catch {
            // 비정상 프레임은 무시.
          }
        },
        onError: () => {
          if (closed) return;
          connected = false;
          if (source) {
            source.close();
            source = null;
          }
          if (reconnectTimer) return; // 이미 재연결 예약됨
          const delay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
          attempt += 1;
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, delay);
        },
      });
    };

    // 창 포커스/가시성 복귀·AppState active 복귀 시: 데이터를 즉시 재조회(놓친 변경 따라잡기)하고,
    // 연결이 죽어 있으면 백오프를 건너뛰고 바로 재연결한다.
    const onResume = () => {
      if (closed) return;
      scheduleFlush(); // SSE가 살아 있어도 안전망으로 한 번 재조회
      if (!connected) {
        attempt = 0;
        clearReconnect();
        connect();
      }
    };

    connect();

    // 포커스/가시성 감지: 웹은 window/document, 네이티브는 AppState.
    let removeResume = () => {};
    if (isWeb && typeof window !== 'undefined') {
      const onFocus = () => onResume();
      const onVisible = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
          onResume();
        }
      };
      window.addEventListener('focus', onFocus);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisible);
      }
      removeResume = () => {
        window.removeEventListener('focus', onFocus);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisible);
        }
      };
    } else {
      const sub = AppState.addEventListener('change', (state) => {
        if (state === 'active') onResume();
      });
      removeResume = () => sub.remove();
    }

    return () => {
      closed = true;
      clearReconnect();
      if (coalesceTimer) {
        clearTimeout(coalesceTimer);
        coalesceTimer = null;
      }
      removeResume();
      if (source) {
        source.close();
        source = null;
      }
    };
  }, [token]);
}
