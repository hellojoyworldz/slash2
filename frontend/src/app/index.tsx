import { Redirect } from 'expo-router';
import { useAuth } from '../auth';

// 시작 지점: 미로그인 → 로그인, 미인증 → 인증 안내, 인증 완료 → 항상 /friends.
// (로그인 복원·화면 스타일 복원 대기는 루트 _layout의 Shell이 담당 — 여기 올 땐 이미 끝나 있다)
// 화면 스타일(채팅형/목록형)은 "테마"라 URL을 가르지 않는다 — 같은 /friends를
// (tabs) 레이아웃이 스타일에 따라 다르게 렌더한다(탭/스플릿 vs 전폭 보드).
export default function Index() {
  const { token, emailVerified } = useAuth();

  if (!token) return <Redirect href="/login" />;
  if (!emailVerified) return <Redirect href="/verify" />;
  return <Redirect href="/friends" />;
}
