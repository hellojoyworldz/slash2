import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  AzeretMono_500Medium,
  useFonts,
} from '@expo-google-fonts/azeret-mono';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppStyleProvider, useAppStyle } from '../app-style';
import { AuthProvider, useAuth } from '../auth';
import { NotifyHost } from '../components/NotifyHost';
import { Text } from '../components/Text';
import { loadStoredLanguage } from '../i18n'; // import 시 i18n 초기화 실행
import { CategoryEditProvider } from '../category-edit';
import { MessageActionsHost, MessageActionsProvider } from '../message-actions';
import { NameEditProvider } from '../name-edit';
import { SelectedRoomProvider } from '../selected-room';
import { TagCreateProvider } from '../tag-create';
import { ThemeColors } from '../theme';
import { ThemeProvider, useTheme } from '../theme-context';

const isWeb = Platform.OS === 'web';

// 웹 전용: 브라우저 기본 파란 포커스 링을 테마를 따라가는 링으로 교체.
// RNW는 버튼을 tabindex 있는 div로 렌더해서 :focus-visible이 마우스 클릭에도
// 매칭된다 → 입력 수단을 직접 감지해 "키보드 탐색 중"일 때만 링을 보여준다.
// currentColor라 다크모드·액센트색에 자동으로 맞는다.
function useFocusRingStyle() {
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'slash-focus-ring';
    style.textContent = `
      :focus { outline: none; }
      html.kbd-nav :focus { outline: 2px solid currentColor; outline-offset: 2px; }
      html.kbd-nav input:focus, html.kbd-nav textarea:focus { outline: none; }
    `;
    document.head.appendChild(style);
    const root = document.documentElement;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') root.classList.add('kbd-nav');
    };
    const onPointer = () => root.classList.remove('kbd-nav');
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('mousedown', onPointer, true);
    window.addEventListener('touchstart', onPointer, true);
    return () => {
      style.remove();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('mousedown', onPointer, true);
      window.removeEventListener('touchstart', onPointer, true);
    };
  }, []);
}

// 테마가 필요한 부분(상태바·배경)을 Provider 안쪽에서 렌더한다.
// 좁은 화면(모바일 웹 포함)도 폰 프레임 없이 화면을 꽉 채운다.
// (데스크톱 레이아웃은 (tabs) 레이아웃이 3패널로 분기)
function Shell() {
  const { colors, resolvedScheme } = useTheme();
  const { booting } = useAuth();
  // 화면 스타일(채팅형/목록형) 프리로드가 끝나기 전에도 라우트를 렌더하지 않는다 —
  // 루트 index가 appStyle에 따라 그룹을 고르므로, 준비 전엔 목록형 유저가 채팅형으로 튄다.
  const { ready: appStyleReady } = useAppStyle();
  useFocusRingStyle();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 저장된 로그인 복원(+화면 스타일 복원)이 끝나기 전에는 라우트를 아예 렌더하지 않는다.
  // (안 그러면 token=null로 오판한 가드가 로그인 화면을 잠깐 보여준다 — 웹 새로고침 깜빡임)
  if (booting || !appStyleReady) {
    return (
      <>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.viewport, styles.boot]}>
          <Text variant="heading" color={colors.ink}>✳ slash</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.viewport}>
        <BottomSheetModalProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          {/* 메시지 액션(⋮ 메뉴·태그 선택·내용 수정) 루트 상주 호스트.
              NotifyHost보다 앞(=아래)에 둬야 태그 삭제 확인 다이얼로그가 위에 뜬다. */}
          <MessageActionsHost />
          {/* 전역 알림/확인 모달 (alert 대체) — 항상 최상위 */}
          <NotifyHost />
        </BottomSheetModalProvider>
      </View>
    </>
  );
}

export default function RootLayout() {
  // 모노 폰트(타임스탬프·카운터류) — 시스템 기본 모노 대신 브랜드 모노를 번들
  const [fontsLoaded, fontsError] = useFonts({ AzeretMono_500Medium });

  // 저장된 언어 선택이 있으면 적용 (없으면 기기 언어 유지).
  useEffect(() => {
    void loadStoredLanguage();
  }, []);

  // 폰트 준비 전 잠깐 대기 (실패하면 시스템 폰트로 그냥 진행)
  if (!fontsLoaded && !fontsError) return null;

  return (
    <GestureHandlerRootView style={rootStyle.root}>
      <ThemeProvider>
        <AuthProvider>
          <AppStyleProvider>
            <SelectedRoomProvider>
              <NameEditProvider>
                <CategoryEditProvider>
                  <TagCreateProvider>
                    <MessageActionsProvider>
                      <Shell />
                    </MessageActionsProvider>
                  </TagCreateProvider>
                </CategoryEditProvider>
              </NameEditProvider>
            </SelectedRoomProvider>
          </AppStyleProvider>
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const rootStyle = StyleSheet.create({
  root: {
    flex: 1,
  },
});

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    viewport: {
      flex: 1,
      backgroundColor: colors.background,
    },
    boot: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
