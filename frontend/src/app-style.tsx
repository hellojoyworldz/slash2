import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// 앱 전체 컨셉(화면 스타일): 채팅형(chat) 또는 목록형(list).
// 화면 스타일은 "테마"다 — URL/라우트 구조를 가르지 않는다. 같은 (tabs) 라우트를
// (tabs) 레이아웃과 각 라우트가 스타일에 따라 다르게 렌더한다:
//   chat = 3패널·탭·채팅 타임라인, list = 탭 크롬 없는 전폭 보드(노션 DB 뷰).
export type AppStyle = 'chat' | 'list';

const KEY = 'slash.appStyle';

function isAppStyle(v: unknown): v is AppStyle {
  return v === 'chat' || v === 'list';
}

interface AppStyleState {
  appStyle: AppStyle;
  setAppStyle: (style: AppStyle) => void;
  /** 저장값 프리로드 완료 여부. 루트가 이 값이 true가 되기 전엔 라우트를 렌더하지 않는다
   *  (안 그러면 기본 'chat'로 오판해 목록형 유저가 잠깐 채팅형으로 튄다 — 웹 새로고침 깜빡임). */
  ready: boolean;
}

const AppStyleContext = createContext<AppStyleState | null>(null);

export function AppStyleProvider({ children }: { children: ReactNode }) {
  const [appStyle, setAppStyleState] = useState<AppStyle>('chat');
  const [ready, setReady] = useState(false);

  // 저장된 선택을 1회 프리로드. AsyncStorage 읽기라 빠르지만, 준비 전엔 라우팅 결정을
  // 미룬다(ready 게이트). 실패해도 기본 'chat'로 진행.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(KEY);
        if (!cancelled && isAppStyle(v)) setAppStyleState(v);
      } catch {
        // 저장소 접근 실패는 무시 — 기본값(chat)으로 동작한다.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAppStyle = useCallback((style: AppStyle) => {
    setAppStyleState(style);
    AsyncStorage.setItem(KEY, style).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ appStyle, setAppStyle, ready }),
    [appStyle, setAppStyle, ready],
  );
  return (
    <AppStyleContext.Provider value={value}>
      {children}
    </AppStyleContext.Provider>
  );
}

export function useAppStyle(): AppStyleState {
  const value = useContext(AppStyleContext);
  if (!value) {
    throw new Error('useAppStyle은 AppStyleProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}
