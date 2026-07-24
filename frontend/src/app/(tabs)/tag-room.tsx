import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import { Tag } from '../../api';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { unauthHref } from '../../auth-routes';
import { ChatScreen } from '../../screens/ChatScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout } from '../../theme';

// 태그 방 라우트. 데스크톱에서는 스플릿뷰 오른쪽 패널이 담당하므로
// 태그 선택만 넘기고 태그 탭으로 돌려보낸다(자동구분 방의 /auto-room과 같은 구조).
export default function TagRoomRoute() {
  const { token, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { setTag, setTagAll } = useSelectedRoom();
  const params = useLocalSearchParams<{ tagId?: string; name?: string }>();
  const tagId = typeof params.tagId === 'string' ? params.tagId : null;
  const name = typeof params.name === 'string' ? params.name : '';
  // 특수값 'all' = 태그 전체 방(태그 하나 이상 달린 메시지 모음, 보기 전용).
  const isAll = tagId === 'all';

  // ChatScreen은 tag.id(조회)·tag.name(헤더)만 쓰므로 params로 최소 Tag를 재구성한다('all'은 제외).
  const tag: Tag | null = useMemo(
    () => (tagId && !isAll ? { id: tagId, name, position: 0 } : null),
    [tagId, isAll, name],
  );

  const isDesktop = width >= layout.desktopBreakpoint;
  useEffect(() => {
    if (!isDesktop) return;
    if (isAll) setTagAll(true);
    else if (tag) setTag(tag);
  }, [isDesktop, isAll, tag, setTag, setTagAll]);

  // 목록형엔 태그 방 개념이 없다 — 태그 보드로 돌려보낸다(기존 관례).
  if (appStyle === 'list') return <Redirect href="/tags" />;
  if (isDesktop) return <Redirect href="/tags" />;

  // 태그 전체 방(보기 전용) — 특수 파라미터로 진입.
  if (isAll) {
    return (
      <ChatScreen
        key="tag:all"
        token={token}
        tagAll
        friendId={null}
        friendName={null}
        bottomTabBar
        onBack={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/tags');
        }}
        onLogout={async () => {
          await logout();
          router.replace(unauthHref());
        }}
      />
    );
  }

  // 잘못된/빈 태그로 들어오면 태그 목록으로.
  if (!tag) return <Redirect href="/tags" />;

  return (
    // key로 태그 방마다 새 인스턴스를 강제(탭 유지로 언마운트 안 됨 → 상태 누수 방지).
    <ChatScreen
      key={`tag:${tag.id}`}
      token={token}
      tag={tag}
      friendId={null}
      friendName={null}
      bottomTabBar
      onBack={() => {
        if (router.canGoBack()) router.back();
        else router.replace('/tags');
      }}
      onLogout={async () => {
        await logout();
        router.replace(unauthHref());
      }}
    />
  );
}
