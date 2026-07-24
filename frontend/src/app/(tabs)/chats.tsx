import { Redirect, useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { unauthHref } from '../../auth-routes';
import { ChatsScreen } from '../../screens/ChatsScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

export default function ChatsRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setRoom } = useSelectedRoom();
  // 데스크톱(스플릿뷰)에서는 화면 이동 대신 오른쪽 대화 패널을 교체한다.
  const isDesktop = width >= layout.desktopBreakpoint;

  // 목록형엔 "채팅" 개념이 없다 — 분류 보드로 돌려보낸다(URL 공간은 공유하되 개념만 없음).
  if (appStyle === 'list') return <Redirect href="/friends" />;

  return (
    <ChatsScreen
      token={token}
      onOpenChat={() => {
        if (isDesktop) setRoom(null);
        else router.push('/chat');
      }}
      onOpenFriend={(friend) => {
        if (isDesktop) setRoom({ friendId: friend.id, name: friend.name });
        else
          router.push({
            pathname: '/chat',
            params: { friendId: friend.id, name: friend.name },
          });
      }}
      onLogout={async () => {
        await logout();
        router.replace(unauthHref());
      }}
    />
  );
}
