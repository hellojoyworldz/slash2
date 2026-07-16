import { Redirect } from 'expo-router';
import { useAuth } from '../auth';

// 시작 지점: 미로그인 → 로그인, 미인증 → 인증 안내, 인증 완료 → 분류 탭
// (로그인 복원 대기는 루트 _layout의 Shell이 담당 — 여기 올 땐 이미 끝나 있다)
export default function Index() {
  const { token, emailVerified } = useAuth();

  if (!token) return <Redirect href="/login" />;
  if (!emailVerified) return <Redirect href="/verify" />;
  return <Redirect href="/friends" />;
}
