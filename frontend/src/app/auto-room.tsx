import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { AutoKind } from '../api';
import { useAppStyle } from '../app-style';
import { useAuth } from '../auth';
import { ChatScreen } from '../screens/ChatScreen';
import { useSelectedRoom } from '../selected-room';
import { layout } from '../theme';

// 모바일 전용 자동구분 방 라우트. 데스크톱에서는 스플릿뷰 오른쪽 패널이 담당하므로
// 방 선택만 넘기고 자동구분 탭으로 돌려보낸다(친구 방의 /chat과 같은 구조).
const AUTO_KINDS: readonly AutoKind[] = [
  'place',
  'video',
  'item',
  'article',
  'memo',
  'link',
];

function parseKind(value: unknown): AutoKind | null {
  return typeof value === 'string' &&
    (AUTO_KINDS as readonly string[]).includes(value)
    ? (value as AutoKind)
    : null;
}

export default function AutoRoomRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setAutoKind } = useSelectedRoom();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = parseKind(params.kind);

  const isDesktop = width >= layout.desktopBreakpoint;
  useEffect(() => {
    if (isDesktop && kind) setAutoKind(kind);
  }, [isDesktop, kind, setAutoKind]);

  // 목록형엔 자동구분 방 개념이 없다 — 분류 보드로 돌려보낸다.
  if (appStyle === 'list') return <Redirect href="/friends" />;
  if (isDesktop) return <Redirect href="/auto" />;
  // 잘못된/빈 종류로 들어오면 자동구분 목록으로.
  if (!kind) return <Redirect href="/auto" />;

  return (
    <ChatScreen
      token={token}
      auto={kind}
      friendId={null}
      friendName={null}
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/auto');
      }}
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    />
  );
}
