import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import { useAppStyle } from '../app-style';
import { useAuth } from '../auth';
import { ChatScreen } from '../screens/ChatScreen';
import { useSelectedRoom } from '../selected-room';
import { layout } from '../theme';

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
    <ChatScreen
      token={token}
      friendId={friendId}
      friendName={friendName}
      onBack={() => {
        // URL로 바로 들어온 경우 뒤로 갈 곳이 없으니 채팅 탭으로
        if (router.canGoBack()) router.back();
        else router.replace('/chats');
      }}
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    />
  );
}
