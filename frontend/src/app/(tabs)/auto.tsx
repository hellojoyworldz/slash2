import { useRouter } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { AutoKind } from '../../api';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { AutoScreen } from '../../screens/AutoScreen';
import { BoardKind, ListBoardScreen } from '../../screens/ListBoardScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

// /auto — 화면 스타일(테마)에 따라 렌더만 갈린다. URL은 두 스타일이 공유한다.
//  · 채팅형: 자동구분 탭(AutoScreen).
//  · 목록형: 자동구분 보드(ListBoardScreen auto) — 전폭 단일 페이지.
export default function AutoRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setAutoKind } = useSelectedRoom();
  // 데스크톱(스플릿뷰)에서는 화면 이동 대신 오른쪽 대화 패널을 자동구분 방으로 교체한다.
  const isDesktop = width >= layout.desktopBreakpoint;

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (appStyle === 'list') {
    return (
      <ListBoardScreen
        token={token}
        board="auto"
        onSwitchBoard={(b: BoardKind) =>
          router.replace(b === 'auto' ? '/auto' : b === 'tags' ? '/tags' : '/friends')
        }
        onOpenMore={() => router.push('/more')}
        onLogout={onLogout}
      />
    );
  }

  return (
    <AutoScreen
      token={token}
      onOpenAuto={(kind: AutoKind) => {
        if (isDesktop) setAutoKind(kind);
        else router.push({ pathname: '/auto-room', params: { kind } });
      }}
      onLogout={onLogout}
    />
  );
}
