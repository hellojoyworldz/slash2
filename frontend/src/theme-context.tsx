import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { ColorScheme, makeColors, ThemeColors } from './theme';

// 라이트/다크/시스템. system이면 기기 설정을 따라간다.
export type ThemeMode = 'light' | 'dark' | 'system';

const MODE_KEY = 'slash.themeMode';

interface ThemeState {
  colors: ThemeColors;
  mode: ThemeMode;
  // 실제로 적용된 스킴 (system 해석 결과)
  resolvedScheme: ColorScheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  // 저장된 테마 모드 복원 (색은 더 이상 사용자 취향이 아님 — 앱 크롬은 흑백 고정)
  useEffect(() => {
    (async () => {
      try {
        const m = await AsyncStorage.getItem(MODE_KEY);
        if (m === 'light' || m === 'dark' || m === 'system') setModeState(m);
      } catch {
        // 저장소 실패 시 기본값(system) 유지
      }
    })();
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {});
  };

  const resolvedScheme: ColorScheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const colors = useMemo(() => makeColors(resolvedScheme), [resolvedScheme]);

  const value = useMemo(
    () => ({ colors, mode, resolvedScheme, setMode }),
    [colors, mode, resolvedScheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme은 ThemeProvider 안에서만 쓸 수 있습니다');
  return value;
}
