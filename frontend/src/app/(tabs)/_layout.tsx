import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useRouter } from 'expo-router';
import { TabList, TabSlot, Tabs, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Platform,
  Pressable,
  PressableStateCallbackType,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Asterisk, Ellipsis, Hash, MessageSquare, Slash } from 'lucide-react-native';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { Text } from '../../components/Text';
import { ChatScreen } from '../../screens/ChatScreen';
import { useSelectedRoom } from '../../selected-room';
import { layout, ThemeColors } from '../../theme';
import { useTheme } from '../../theme-context';

// RNW가 런타임에 주는 hovered 상태 (RN 타입에는 없어서 확장)
type PressState = PressableStateCallbackType & { hovered?: boolean };

// 목록 패널 폭 (텔레그램처럼 드래그로 조절, 저장됨)
// 상한은 고정값이 아니라 "대화 패널 최소 폭(400)만 지키면 자유".
const LIST_WIDTH_KEY = 'slash.listPaneWidth';
const LIST_MIN = 280;
const CHAT_MIN = 400; // 대화 패널 최소 확보 폭
const RAIL_WIDTH = 96;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// 웹에서만 리사이즈 커서 (RN 타입에 없는 값이라 캐스팅)
const resizeCursor =
  Platform.OS === 'web'
    ? ({ cursor: 'col-resize' } as unknown as ViewStyle)
    : null;

// 탭 아이콘 (카카오처럼 아이콘 네비, 라벨은 스크린리더용)
const TAB_ICONS = {
  chats: MessageSquare,
  slashes: Slash,
  // 자동구분 — ✳ 글리프(카드 꼬리표·워드마크)와 정체성을 잇는 asterisk.
  auto: Asterisk,
  // 태그 — lucide Hash(#).
  tags: Hash,
  more: Ellipsis,
} as const;
type TabIconKey = keyof typeof TAB_ICONS;

// 탭 버튼 — 좁은 화면은 하단 가로 탭, 넓은 화면은 왼쪽 세로 레일 항목.
const TabButton = forwardRef<
  View,
  TabTriggerSlotProps & {
    icon: TabIconKey;
    label: string;
    rail?: boolean;
    /** 레일에서 바닥에 붙임 (설정류 — 데스크톱 사이드바 문법) */
    pushBottom?: boolean;
  }
>(function TabButton(
  { icon, label, rail = false, pushBottom = false, isFocused, ...props },
  ref,
) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const Icon = TAB_ICONS[icon];
  return (
    <Pressable
      ref={ref}
      {...props}
      style={(state: PressState) => [
        rail ? styles.railItem : styles.tabItem,
        rail && pushBottom && styles.railItemBottom,
        rail && state.hovered && styles.railItemHover,
        rail && isFocused && styles.railItemActive,
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
    >
      <Icon
        size={rail ? 20 : 24}
        strokeWidth={2}
        color={
          rail
            ? isFocused
              ? colors.onAccent
              : colors.textSecondary
            : isFocused
              ? colors.accent
              : colors.textTertiary
        }
      />
    </Pressable>
  );
});

export default function TabsLayout() {
  const { token, emailVerified, logout } = useAuth();
  const { t } = useTranslation();
  const { appStyle } = useAppStyle();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { room, setRoom, autoKind, setAutoKind, tag, setTag } = useSelectedRoom();
  const router = useRouter();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 넓은 화면(데스크톱·태블릿 가로) = 메신저 3패널 (레일 | 목록 | 대화)
  const isDesktop = width >= layout.desktopBreakpoint;
  // 직전 렌더가 데스크톱이었는지. "데스크톱→모바일로 넘어온 순간"만 잡아
  // 보던 방을 /chat으로 이어주기 위한 것(아래 참조). 값 갱신은 커밋 후에만.
  const wasDesktopRef = useRef(isDesktop);
  useEffect(() => {
    wasDesktopRef.current = isDesktop;
  }, [isDesktop]);

  // ── 목록/대화 사이 드래그 스플리터 ──
  const [listWidth, setListWidthState] = useState(360);
  const [dividerActive, setDividerActive] = useState(false);
  const listWidthRef = useRef(360);
  const dragStartRef = useRef(360);
  const maxListRef = useRef(LIST_MIN);
  // 상한 = 창폭에서 레일과 대화 최소 폭을 뺀 만큼 (자유롭게, 텔레그램식)
  const maxList = Math.max(LIST_MIN, width - RAIL_WIDTH - CHAT_MIN);
  maxListRef.current = maxList;
  const paneWidth = clamp(listWidth, LIST_MIN, maxList);

  const setListWidth = (w: number) => {
    listWidthRef.current = w;
    setListWidthState(w);
  };

  // 저장된 폭 복원
  useEffect(() => {
    AsyncStorage.getItem(LIST_WIDTH_KEY)
      .then((v) => {
        const n = Number(v);
        // 상한은 렌더 시 창폭에 맞춰 다시 클램프되므로 저장값은 느슨하게 검증
        if (v && n >= LIST_MIN && n <= 4000) setListWidth(n);
      })
      .catch(() => {});
  }, []);

  const dividerGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onStart(() => {
          dragStartRef.current = listWidthRef.current;
          setDividerActive(true);
        })
        .onUpdate((e) => {
          setListWidth(
            clamp(dragStartRef.current + e.translationX, LIST_MIN, maxListRef.current),
          );
        })
        .onFinalize(() => {
          setDividerActive(false);
          AsyncStorage.setItem(
            LIST_WIDTH_KEY,
            String(Math.round(listWidthRef.current)),
          ).catch(() => {});
        }),
    // 상태는 전부 ref로 읽으므로 제스처는 한 번만 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 앱 내부는 로그인 + 이메일 인증을 마친 유저만 접근 가능.
  if (!token) return <Redirect href="/login" />;
  if (!emailVerified) return <Redirect href="/verify" />;

  const triggers = (rail: boolean) => (
    <>
      <TabTrigger name="friends" href="/friends" asChild>
        <TabButton icon="slashes" label={t('tabs.friends')} rail={rail} />
      </TabTrigger>
      <TabTrigger name="chats" href="/chats" asChild>
        <TabButton icon="chats" label={t('tabs.chats')} rail={rail} />
      </TabTrigger>
      <TabTrigger name="auto" href="/auto" asChild>
        <TabButton icon="auto" label={t('tabs.auto')} rail={rail} />
      </TabTrigger>
      <TabTrigger name="tags" href="/tags" asChild>
        <TabButton icon="tags" label={t('tabs.tags')} rail={rail} />
      </TabTrigger>
      <TabTrigger name="more" href="/more" asChild>
        <TabButton icon="more" label={t('tabs.more')} rail={rail} pushBottom />
      </TabTrigger>
    </>
  );

  // ── 목록형(list) ──
  // 화면 스타일은 "테마"다 — URL/라우트는 채팅형과 동일하고 렌더만 교체한다.
  // 탭바/레일 크롬 없이 각 라우트(friends/auto/more)의 목록형 화면을 전폭으로 렌더.
  // TabList는 여전히 필요하다(Tabs 내비게이터가 어떤 라우트가 탭인지 알아야 라우팅됨) —
  // 다만 0크기·접근성 숨김으로 화면에서 치운다. 보드 자체가 세그먼트·⋯로 네비게이션한다.
  if (appStyle === 'list') {
    return (
      <Tabs style={styles.container}>
        <TabList
          style={styles.hiddenTabList}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {triggers(false)}
        </TabList>
        <TabSlot style={styles.slot} />
      </Tabs>
    );
  }

  // 주의: TabList는 반드시 Tabs의 "직속 자식"이어야 한다 (View로 감싸면
  // 헤드리스 파서가 트리거를 못 찾아 "no screens" 에러).
  if (isDesktop) {
    return (
      <Tabs style={styles.containerRail}>
        {/* ① 네비 레일 (상단은 워드마크 오버레이 자리) */}
        <TabList style={styles.rail}>{triggers(true)}</TabList>

        {/* ② 목록 패널: 탭 화면(채팅/친구/더보기)이 여기 들어옴 */}
        <View style={[styles.listPane, { width: paneWidth }]}>
          <TabSlot style={styles.slot} />
        </View>

        {/* ②↔③ 드래그 스플리터 (텔레그램식 너비 조절) */}
        <GestureDetector gesture={dividerGesture}>
          <View
            style={[styles.divider, resizeCursor]}
            accessibilityRole="adjustable"
            accessibilityLabel={t('a11y.resizeList')}
            accessibilityValue={{
              min: LIST_MIN,
              max: Math.round(maxList),
              now: Math.round(paneWidth),
            }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => {
              const delta = e.nativeEvent.actionName === 'increment' ? 24 : -24;
              const next = clamp(listWidthRef.current + delta, LIST_MIN, maxList);
              setListWidth(next);
              AsyncStorage.setItem(LIST_WIDTH_KEY, String(next)).catch(() => {});
            }}
          >
            <View
              style={[styles.dividerLine, dividerActive && styles.dividerLineActive]}
            />
          </View>
        </GestureDetector>

        {/* ③ 대화 패널: 항상 상주, 남은 폭 전부. 방 선택 시 여기만 교체.
            렌더 우선순위: tag > autoKind > room(일반). 태그·자동구분은 보기 전용 방. */}
        <View style={styles.chatPane}>
          {tag ? (
            <ChatScreen
              key={`tag:${tag.id}`}
              token={token}
              tag={tag}
              friendId={null}
              friendName={null}
              showBack
              onBack={() => setTag(null)}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          ) : autoKind ? (
            <ChatScreen
              key={`auto:${autoKind}`}
              token={token}
              auto={autoKind}
              friendId={null}
              friendName={null}
              showBack
              onBack={() => setAutoKind(null)}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          ) : (
            <ChatScreen
              key={room?.friendId ?? 'self'}
              token={token}
              friendId={room?.friendId ?? null}
              friendName={room?.name ?? null}
              showBack={room !== null}
              onBack={() => setRoom(null)}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          )}
        </View>

        {/* 워드마크 오버레이 */}
        <View pointerEvents="none" style={styles.railBrandWrap}>
          <Text variant="heading" color={colors.ink}>✳ slash</Text>
        </View>
      </Tabs>
    );
  }

  // 데스크톱 3패널에서 좁은 화면으로 막 넘어온 순간, 방을 보고 있었다면
  // 목록으로 튕기지 말고 그 방의 /chat 라우트로 이어준다.
  // wasDesktopRef가 "그 순간"만 한정하므로, 모바일에서 목록으로 되돌아가도
  // 다시 /chat으로 끌려가지 않는다(무한 리다이렉트 방지). room이 있을 때만.
  if (wasDesktopRef.current && tag) {
    return (
      <Redirect
        href={{ pathname: '/tag-room', params: { tagId: tag.id, name: tag.name } }}
      />
    );
  }
  if (wasDesktopRef.current && autoKind) {
    return (
      <Redirect href={{ pathname: '/auto-room', params: { kind: autoKind } }} />
    );
  }
  if (wasDesktopRef.current && room) {
    return (
      <Redirect
        href={{
          pathname: '/chat',
          params: { friendId: room.friendId, name: room.name },
        }}
      />
    );
  }

  return (
    <Tabs style={styles.container}>
      <TabSlot style={styles.slot} />
      <TabList style={styles.tabBar}>{triggers(false)}</TabList>
    </Tabs>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // TabSlot(react-native-screens ScreenContainer)의 기본 스타일은
  // {flexShrink:0, flexGrow:1} — 웹(RNW=실제 CSS flexbox)에서 부모 높이에
  // 갇히지 못하고 내용만큼 자라(1500) 페이지를 밀어낸다. 스크롤러(FlatList)가
  // 패널 높이에 바운드되도록 flex:1(grow1/shrink1/basis0) + minHeight:0으로 덮는다.
  slot: {
    flex: 1,
    minHeight: 0,
  },
  // 목록형에서 등록만 유지하고 화면에선 치우는 TabList (0크기·흐름 밖).
  hiddenTabList: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  containerRail: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  // ── 좁은 화면: 하단 탭바 ──
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.background,
    paddingBottom: layout.bottomPad,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 13,
  },
  tabLabelActive: {
    fontWeight: '800',
  },
  // ── 넓은 화면: 3패널 ──
  rail: {
    width: 96,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'stretch',
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
    paddingTop: 72, // 워드마크 오버레이 자리
    paddingHorizontal: 10,
    backgroundColor: colors.background,
  },
  railBrandWrap: {
    position: 'absolute',
    top: 26,
    left: 18,
  },
  // 레일 항목: 보더 없이 조용하게, 활성만 accent로 채운다
  railItem: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 0,
    marginBottom: 4,
  },
  railItemBottom: {
    marginTop: 'auto',
    marginBottom: 12,
  },
  railItemHover: {
    backgroundColor: colors.surface,
  },
  railItemActive: {
    backgroundColor: colors.accent,
  },
  listPane: {
    // 3패널 row의 교차축 stretch로 높이는 뷰포트에 고정된다.
    // 스크롤러 밖으로 새어나온 내용이 문서를 늘리지 못하게 여기서 클립(backstop).
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  // 드래그 히트 영역(9px, 투명) — 가운데 1px 라인만 보인다.
  divider: {
    width: 9,
    marginHorizontal: -4, // 양쪽 패널 위로 살짝 겹쳐 잡기 쉽게
    zIndex: 2,
    alignItems: 'center',
  },
  dividerLine: {
    flex: 1,
    width: 1,
    backgroundColor: colors.hairline,
  },
  // 드래그 중 표시는 거의 무표시: 색 그대로, 두께만 2→3px
  dividerLineActive: {
    width: 2,
  },
  chatPane: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
