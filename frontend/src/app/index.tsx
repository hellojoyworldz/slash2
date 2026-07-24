import { Redirect } from 'expo-router';
import { useAuth } from '../auth';
import { unauthHref } from '../auth-routes';

// 시작 지점: 미로그인 → (웹은 마케팅 랜딩 /home, 네이티브는 /login), 미인증 → 인증 안내,
// 인증 완료 → 항상 /friends.
// (로그인 복원·화면 스타일 복원 대기는 루트 _layout의 Shell이 담당 — 여기 올 땐 이미 끝나 있다)
// 화면 스타일(채팅형/목록형)은 "테마"라 URL을 가르지 않는다 — 같은 /friends를
// (tabs) 레이아웃이 스타일에 따라 다르게 렌더한다(탭/스플릿 vs 전폭 보드).
export default function Index() {
  const { token, emailVerified } = useAuth();

  // 랜딩(/home)은 웹 전용 간판 — 네이티브 미로그인은 기존대로 로그인 화면으로 보낸다.
  if (!token) return <Redirect href={unauthHref()} />;
  if (!emailVerified) return <Redirect href="/verify" />;
  return <Redirect href="/friends" />;
}
