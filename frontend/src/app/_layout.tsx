import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../auth';
import { NotifyHost } from '../components/NotifyHost';
import { loadStoredLanguage } from '../i18n'; // import 시 i18n 초기화 실행
import { colors } from '../theme';

export default function RootLayout() {
  // 저장된 언어 선택이 있으면 적용 (없으면 기기 언어 유지).
  useEffect(() => {
    void loadStoredLanguage();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <AuthProvider>
        <StatusBar style="dark" />
        {/* 웹에서는 폰 폭 프레임 안에 가운데 정렬해서 보여준다 */}
        <View style={styles.viewport}>
          <View style={styles.frame}>
            <BottomSheetModalProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              />
              {/* 전역 알림/확인 모달 (alert 대체) */}
              <NotifyHost />
            </BottomSheetModalProvider>
          </View>
        </View>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const isWeb = Platform.OS === 'web';

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  viewport: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: isWeb ? '#EFEFEF' : colors.background,
  },
  frame: {
    flex: 1,
    width: '100%',
    maxWidth: isWeb ? 480 : undefined,
    backgroundColor: colors.background,
    borderLeftWidth: isWeb ? 1 : 0,
    borderRightWidth: isWeb ? 1 : 0,
    borderColor: colors.hairline,
  },
});
