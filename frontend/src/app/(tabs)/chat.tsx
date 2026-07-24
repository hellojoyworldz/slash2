import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { unauthHref } from '../../auth-routes';
import { ChatScreen } from '../../screens/ChatScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

export default function ChatRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setRoom } = useSelectedRoom();
  // /chat → 나에게 방, /chat?friendId=..&name=.. → 친구 방
  const params = useLocalSearchParams<{ friendId?: string; name?: string }>();
  const friendId = typeof params.friendId === 'string' ? params.friendId : null;
  const friendName = typeof params.name === 'string' ? params.name : null;

  // 데스크톱에서는 전용 채팅 화면이 없다(스플릿뷰 오른쪽 패널이 담당).
  // URL로 직접 들어오거나 창을 넓히면 방 선택만 넘기고 탭으로 돌려보낸다.
  const isDesktop = width >= layout.desktopBreakpoint;
  useEffect(() => {
    if (isDesktop && friendId && friendName) {
      setRoom({ friendId, name: friendName });
    }
  }, [isDesktop, friendId, friendName, setRoom]);

  // 목록형엔 채팅방 개념이 없다 — 분류 보드로 돌려보낸다.
  if (appStyle === 'list') return <Redirect href="/friends" />;
  if (isDesktop) return <Redirect href="/chats" />;

  return (
    // key로 방마다 새 인스턴스를 강제한다. (tabs) 안 라우트라 방 전환 시 언마운트되지
    // 않으므로(탭 유지), key 없이는 mount-once draft/상태가 이전 방에서 새 방으로 샌다.
    // 데스크톱 상주 패널의 key 규칙과 동일.
    <ChatScreen
      key={friendId ?? 'self'}
      token={token}
      friendId={friendId}
      friendName={friendName}
      bottomTabBar
      onBack={() => {
        // URL로 바로 들어온 경우 뒤로 갈 곳이 없으니 채팅 탭으로
        if (router.canGoBack()) router.back();
        else router.replace('/chats');
      }}
      onLogout={async () => {
        await logout();
        router.replace(unauthHref());
      }}
    />
  );
}
