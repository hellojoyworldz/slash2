import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useAuth } from '../../auth';
import { FriendsScreen } from '../../screens/FriendsScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

export default function FriendsRoute() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setRoom } = useSelectedRoom();
  // 데스크톱(스플릿뷰)에서는 화면 이동 대신 오른쪽 대화 패널을 교체한다.
  const isDesktop = width >= layout.desktopBreakpoint;

  return (
    <FriendsScreen
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
        router.replace('/login');
      }}
    />
  );
}
