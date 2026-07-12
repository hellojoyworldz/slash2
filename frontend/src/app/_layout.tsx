import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider } from '../auth';
import { colors } from '../theme';

export default function RootLayout() {
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
