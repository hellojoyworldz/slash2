import { Redirect, useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { FriendsList } from '../../screens/FriendsScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

// /categories — 신설 "분류" 탭. 캡슐(분류|태그|자동구분) 없이 순수 분류 리스트만 보여준다.
// "그룹" 탭(/friends, FriendsScreen 캡슐 컨테이너)이 예전 아이콘을 물려받았으므로, 이 탭이
// 대신 예전 분류 탭의 아이콘 정체성을 이어받는다(_layout.tsx 참고).
// 방 열기 라우팅은 그룹 탭(friends.tsx)이 FriendsScreen에 넘기는 배선과 동일하게 미러링한다.
export default function CategoriesRoute() {
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

  // 목록형(ListBoardScreen)엔 순수 분류 "리스트" 개념이 없다 — 분류는 이미 보드의 그룹 섹션으로
  // 보이므로, /chats가 목록형에서 /friends로 돌아가는 것과 같은 방식으로 분류 보드로 돌려보낸다.
  if (appStyle === 'list') return <Redirect href="/friends" />;

  return (
    <FriendsList
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
