import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth';
import { colors } from '../theme';

// 시작 지점: 미로그인 → 로그인, 미인증 → 인증 안내, 인증 완료 → 친구 탭
export default function Index() {
  const { booting, token, emailVerified } = useAuth();

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (!token) return <Redirect href="/login" />;
  if (!emailVerified) return <Redirect href="/verify" />;
  return <Redirect href="/friends" />;
}
