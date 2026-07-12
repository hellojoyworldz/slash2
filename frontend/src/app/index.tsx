import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../auth';
import { colors } from '../theme';

// 시작 지점: 로그인돼 있으면 친구 탭, 아니면 로그인 화면으로
export default function Index() {
  const { booting, token } = useAuth();

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return <Redirect href={token ? '/friends' : '/login'} />;
}
