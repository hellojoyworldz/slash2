import { Redirect } from 'expo-router';
import { useAuth } from '../auth';
import { api } from '../api';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

export default function VerifyRoute() {
  const { token, email, emailVerified, logout, refresh } = useAuth();

  // 로그인 안 됐으면 로그인으로, 이미 인증됐으면 앱으로.
  if (!token) return <Redirect href="/login" />;
  if (emailVerified) return <Redirect href="/friends" />;

  return (
    <VerifyEmailScreen
      email={email}
      onVerifyCode={async (code) => {
        const { verified } = await api.verifyEmailCode(token, code);
        // 인증되면 컨텍스트를 갱신해 라우트가 앱으로 이동시킨다.
        if (verified) await refresh();
        return verified;
      }}
      onResend={async () => {
        await api.resendVerification(token);
      }}
      onLogout={logout}
      onRefresh={refresh}
    />
  );
}
