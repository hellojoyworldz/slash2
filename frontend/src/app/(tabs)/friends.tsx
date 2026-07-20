import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { FriendsScreen } from '../../screens/FriendsScreen';
import { BoardKind, ListBoardScreen } from '../../screens/ListBoardScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

// /friends — 화면 스타일(테마)에 따라 렌더만 갈린다. URL은 두 스타일이 공유한다.
//  · 채팅형: 분류 탭(FriendsScreen). 데스크톱은 (tabs) 레이아웃이 스플릿뷰로 감싼다.
//  · 목록형: 분류 보드(ListBoardScreen category) — 전폭 단일 페이지.
export default function FriendsRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setRoom } = useSelectedRoom();
  // 데스크톱(스플릿뷰)에서는 화면 이동 대신 오른쪽 대화 패널을 교체한다.
  const isDesktop = width >= layout.desktopBreakpoint;

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (appStyle === 'list') {
    return (
      <ListBoardScreen
        token={token}
        board="category"
        onSwitchBoard={(b: BoardKind) =>
          router.replace(b === 'auto' ? '/auto' : b === 'tags' ? '/tags' : '/friends')
        }
        onOpenMore={() => router.push('/more')}
        onLogout={onLogout}
      />
    );
  }

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
      onLogout={onLogout}
    />
  );
}
