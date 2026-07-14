import { Redirect } from 'expo-router';
import { useAuth } from '../auth';
import { LoginScreen } from '../screens/LoginScreen';

export default function LoginRoute() {
  const { token, emailVerified, loggedIn } = useAuth();

  // 이미 로그인돼 있으면 인증 여부에 따라 이동
  if (token) return <Redirect href={emailVerified ? '/friends' : '/verify'} />;

  return <LoginScreen onLoggedIn={loggedIn} />;
}
