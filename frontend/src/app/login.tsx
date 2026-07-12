import { Redirect } from 'expo-router';
import { useAuth } from '../auth';
import { LoginScreen } from '../screens/LoginScreen';

export default function LoginRoute() {
  const { token, loggedIn } = useAuth();

  // 이미 로그인돼 있으면 친구 탭으로
  if (token) return <Redirect href="/friends" />;

  return <LoginScreen onLoggedIn={loggedIn} />;
}
