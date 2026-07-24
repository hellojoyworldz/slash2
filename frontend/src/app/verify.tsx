import { Redirect } from 'expo-router';
import { useAuth } from '../auth';
import { unauthHref } from '../auth-routes';
import { api } from '../api';
import { VerifyEmailScreen } from '../screens/VerifyEmailScreen';

export default function VerifyRoute() {
  const { token, email, emailVerified, logout, refresh } = useAuth();

  // 로그인 안 됐으면 미인증 착지(웹=랜딩/네이티브=로그인)로, 이미 인증됐으면 앱으로.
  if (!token) return <Redirect href={unauthHref()} />;
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
