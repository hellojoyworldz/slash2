import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { Tag } from '../../api';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { BoardKind, ListBoardScreen } from '../../screens/ListBoardScreen';
import { TagsScreen } from '../../screens/TagsScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

// /tags — 화면 스타일(테마)에 따라 렌더만 갈린다. URL은 두 스타일이 공유한다.
//  · 채팅형: 태그 탭(TagsScreen). 데스크톱은 (tabs) 레이아웃이 스플릿뷰로 감싼다.
//  · 목록형: 태그 보드(ListBoardScreen tags) — 전폭 단일 페이지.
export default function TagsRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setTag, setTagAll } = useSelectedRoom();
  // 데스크톱(스플릿뷰)에서는 화면 이동 대신 오른쪽 대화 패널을 태그 방으로 교체한다.
  const isDesktop = width >= layout.desktopBreakpoint;

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  const switchBoard = (b: BoardKind) =>
    router.replace(b === 'auto' ? '/auto' : b === 'tags' ? '/tags' : '/friends');

  if (appStyle === 'list') {
    return (
      <ListBoardScreen
        token={token}
        board="tags"
        onSwitchBoard={switchBoard}
        onOpenMore={() => router.push('/more')}
        onLogout={onLogout}
      />
    );
  }

  return (
    <TagsScreen
      token={token}
      onOpenTag={(tag: Tag) => {
        if (isDesktop) setTag(tag);
        else
          router.push({
            pathname: '/tag-room',
            params: { tagId: tag.id, name: tag.name },
          });
      }}
      onOpenTagAll={() => {
        if (isDesktop) setTagAll(true);
        else router.push({ pathname: '/tag-room', params: { tagId: 'all' } });
      }}
      onLogout={onLogout}
    />
  );
}
