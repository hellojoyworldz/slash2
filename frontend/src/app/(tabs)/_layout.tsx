import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useRouter } from 'expo-router';
import { TabList, TabSlot, Tabs, TabTrigger, TabTriggerSlotProps } from 'expo-router/ui';
import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  GestureResponderEvent,
  Platform,
  Pressable,
  PressableStateCallbackType,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';
import { Asterisk, Ellipsis, Hash, LayoutGrid, MessageSquare, Slash } from 'lucide-react-native';
import { api, HideableTab, TabKey } from '../../api';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { Logo } from '../../components/Logo';
import { Text } from '../../components/Text';
import { resolveHiddenTabs, resolveTabOrder } from '../../tab-menu';
import {
  ReorderAxis,
  TAB_LIFT,
  TabReorderControls,
  useTabItemAnimatedStyle,
  useTabReorder,
} from '../../tab-reorder';
import { ChatScreen } from '../../screens/ChatScreen';
import { LicensesScreen } from '../../screens/LicensesScreen';
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
  // 그룹(캡슐 컨테이너: 분류|태그|자동구분) — 격자 아이콘.
  group: LayoutGrid,
  chats: MessageSquare,
  // 분류(신설, 캡슐 없는 순수 리스트) — 그룹이 새 아이콘을 가져간 대신 예전 분류 탭 아이콘을 잇는다.
  slashes: Slash,
  // 자동구분 — ✳ 글리프(카드 꼬리표·워드마크)와 정체성을 잇는 asterisk.
  auto: Asterisk,
  // 태그 — lucide Hash(#).
  tags: Hash,
  more: Ellipsis,
} as const;
type TabIconKey = keyof typeof TAB_ICONS;

// 재정렬 대상 5탭의 정의(라우트·아이콘·라벨 i18n 키). 순서·노출은 users.tabOrder/hiddenTabs로
// 결정하고 여기서 실제 트리거를 배열한다. 더보기는 이 목록 밖에서 항상 맨끝에 붙는다.
// (label 키는 기존 tabs.* 재사용 — categories 라우트는 역사적 사정으로 tabs.friends='분류'를 쓴다.)
const TAB_DEFS: Record<TabKey, { href: string; icon: TabIconKey; labelKey: string }> = {
  friends: { href: '/friends', icon: 'group', labelKey: 'tabs.group' },
  chats: { href: '/chats', icon: 'chats', labelKey: 'tabs.chats' },
  categories: { href: '/categories', icon: 'slashes', labelKey: 'tabs.friends' },
  tags: { href: '/tags', icon: 'tags', labelKey: 'tabs.tags' },
  auto: { href: '/auto', icon: 'auto', labelKey: 'tabs.auto' },
};

// 방 화면 라우트(개별 채팅·태그 방·자동구분 방). (tabs) 그룹 안에 살아
// 모바일에서 방에 들어가도 하단 탭바가 유지되게 한다. 탭바/레일엔 버튼이 없는
// "숨김 트리거"로만 등록한다((tabs) 그룹이라 URL은 /chat·/tag-room·/auto-room 그대로).
const ROOM_ROUTES: readonly { name: string; href: string }[] = [
  { name: 'chat', href: '/chat' },
  { name: 'tag-room', href: '/tag-room' },
  { name: 'auto-room', href: '/auto-room' },
];

// 탭 버튼 Pressable 스타일(탭바=가로, 레일=세로 공통) — TabButton·ReorderTabButton이 공유.
type TabPressOpts = { rail: boolean; isFocused?: boolean; pushBottom?: boolean };
const tabPressableStyle =
  (styles: ReturnType<typeof makeStyles>, { rail, isFocused, pushBottom }: TabPressOpts) =>
  (state: PressState): ViewStyle[] =>
    [
      rail ? styles.railItem : styles.tabItem,
      rail && pushBottom && styles.railItemBottom,
      rail && state.hovered && styles.railItemHover,
      rail && isFocused && styles.railItemActive,
      // 모바일 하단 탭도 데스크톱 레일과 같은 문법: 활성 = accent 잉크 채움(라운드 0).
      !rail && isFocused && styles.tabItemActive,
    ].filter(Boolean) as ViewStyle[];

// 탭 아이콘 잉크 — 활성은 레일·탭바 공통 onAccent(잉크 위 반전), 비활성만 레일/탭바가 다르다.
const tabIconColor = (colors: ThemeColors, rail: boolean, isFocused?: boolean) =>
  isFocused ? colors.onAccent : rail ? colors.textSecondary : colors.textTertiary;

// 탭 버튼 — 좁은 화면은 하단 가로 탭, 넓은 화면은 왼쪽 세로 레일 항목.
const TabButton = forwardRef<
  View,
  TabTriggerSlotProps & {
    icon: TabIconKey;
    label: string;
    rail?: boolean;
    /** 레일에서 바닥에 붙임 (설정류 — 데스크톱 사이드바 문법) */
    pushBottom?: boolean;
    /** 숨긴 탭 — 라우트(트리거)는 등록해 두되(직접 URL·캡슐 경유 접근) 바/레일에선 치운다. */
    hidden?: boolean;
  }
>(function TabButton(
  { icon, label, rail = false, pushBottom = false, hidden = false, isFocused, ...props },
  ref,
) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const Icon = TAB_ICONS[icon];
  // 숨긴 탭: 트리거 자체는 살려 라우팅을 유지하되(제거하면 "no screens"·라우트 소실),
  // 흐름 밖 0크기·접근성 숨김으로 화면에서만 뺀다. position:absolute라 flex 배분에도 안 낀다.
  if (hidden) {
    return (
      <Pressable
        ref={ref}
        {...props}
        style={styles.tabHidden}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        focusable={false}
      />
    );
  }
  return (
    <Pressable
      ref={ref}
      {...props}
      style={tabPressableStyle(styles, { rail, isFocused, pushBottom })}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      accessibilityLabel={label}
    >
      <Icon size={rail ? 20 : 24} strokeWidth={2} color={tabIconColor(colors, rail, isFocused)} />
    </Pressable>
  );
});

// 재정렬 가능한 탭 버튼(보이는 5탭) — 꾹(250ms) 눌렀다 끌면 그 자리에서 순서가 바뀐다.
// TabTrigger가 주는 onPress(네비)는 그대로 살리되(롱프레스 전엔 탭=이동), GestureDetector로
// 롱프레스 드래그를 겹쳐 얹는다. 잡은 탭은 손가락 추종(가로 탭바=X, 세로 레일=Y), 나머지는 비켜남.
const ReorderTabButton = forwardRef<
  View,
  TabTriggerSlotProps & {
    icon: TabIconKey;
    label: string;
    rail: boolean;
    reorder: TabReorderControls;
    /** 보이는 탭들 안에서의 인덱스(숨긴 탭 제외). */
    index: number;
    tabKey: TabKey;
    axis: ReorderAxis;
  }
>(function ReorderTabButton(
  { icon, label, rail, reorder, index, tabKey, axis, isFocused, onPress, ...props },
  ref,
) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const Icon = TAB_ICONS[icon];
  const animStyle = useTabItemAnimatedStyle(reorder, index, axis);
  const isDragging = reorder.draggingKey === tabKey;
  // 드래그 세션이면(롱프레스 활성) 그 뒤 따라오는 탭/클릭의 네비게이션을 눌러 무시한다.
  const guardedPress = useCallback(
    (e: GestureResponderEvent) => {
      if (reorder.didDragRef.current) return;
      onPress?.(e);
    },
    [onPress, reorder],
  );
  return (
    <GestureDetector gesture={reorder.getGesture(tabKey)}>
      <Animated.View
        onLayout={(e) => reorder.onItemLayout(index, e)}
        style={[
          // 탭바(가로)는 flex:1로 균등폭. 레일(세로)은 자연 크기.
          !rail && styles.tabItemFlex,
          animStyle,
          isDragging && TAB_LIFT,
        ]}
      >
        <Pressable
          ref={ref}
          {...props}
          onPress={guardedPress}
          style={tabPressableStyle(styles, { rail, isFocused })}
          accessibilityRole="tab"
          accessibilityState={{ selected: !!isFocused }}
          accessibilityLabel={label}
        >
          <Icon size={rail ? 20 : 24} strokeWidth={2} color={tabIconColor(colors, rail, isFocused)} />
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
});

export default function TabsLayout() {
  const { token, emailVerified, logout, tabOrder, hiddenTabs, setTabOrder } = useAuth();
  const { t } = useTranslation();
  const { appStyle } = useAppStyle();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const {
    room,
    setRoom,
    autoKind,
    setAutoKind,
    tag,
    setTag,
    tagAll,
    setTagAll,
    autoAll,
    setAutoAll,
    infoScreen,
    setInfoScreen,
  } = useSelectedRoom();
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

  // 사용자 순서·노출을 방어 정규화(null·오염이면 기본값). 로그인 상태(컨텍스트)에서 읽으므로
  // 900px 트리 스왑에도 생존한다(화면 로컬 state 아님).
  const order = resolveTabOrder(tabOrder);
  const hidden = resolveHiddenTabs(hiddenTabs);
  // 바/레일에 실제로 배열되는(보이는) 탭들 — 재정렬 대상. 숨긴 탭은 여기 없다.
  const visibleOrder = order.filter((k) => !hidden.includes(k as HideableTab));

  // ── 탭바/레일 아이콘 직접 드래그 재정렬 ──
  // 방향: 모바일 하단 탭바=가로(x), 데스크톱 레일=세로(y). 스왑 시 갱신(제스처는 ref로 축을 읽음).
  const reorderAxis: ReorderAxis = isDesktop ? 'y' : 'x';
  // 드래그 중 불변, 놓을 때만 커밋되는 "보이는 탭 순서"의 원천(제스처가 ref로 읽는다).
  const visibleOrderRef = useRef<string[]>(visibleOrder);
  visibleOrderRef.current = visibleOrder;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  // 확정된 보이는 탭 순서로 tabOrder 전체를 재구성 — 숨긴 탭은 원래 슬롯에 그대로 두고
  // 보이는 슬롯만 새 순서로 치환한다(숨긴 탭 상대 위치 보존). MoreScreen과 같은 낙관+서버 계약.
  const commitVisibleOrder = (newVisible: string[]) => {
    let vi = 0;
    const next = order.map((k) =>
      hidden.includes(k as HideableTab) ? k : (newVisible[vi++] as TabKey),
    );
    const prev = order;
    setTabOrder(next);
    const tk = tokenRef.current;
    if (tk) api.updateProfile(tk, { tabOrder: next }).catch(() => setTabOrder(prev));
  };
  const reorder = useTabReorder({
    axis: reorderAxis,
    visibleOrderRef,
    onCommit: commitVisibleOrder,
  });

  // 앱 내부는 로그인 + 이메일 인증을 마친 유저만 접근 가능.
  if (!token) return <Redirect href="/login" />;
  if (!emailVerified) return <Redirect href="/verify" />;

  // 순서대로 5탭 트리거를 깔고, 더보기는 항상 맨끝. 숨긴 탭도 트리거는 유지(라우팅용)하되
  // hidden으로 바/레일에서만 뺀다 — 순서 목록에는 그대로 있어 노출 시 그 자리로 돌아온다.
  // reorderEnabled면 보이는 탭은 ReorderTabButton(꾹 눌러 드래그 재정렬)으로 얹는다.
  const triggers = (rail: boolean, reorderEnabled: boolean) => (
    <>
      {order.map((key) => {
        const def = TAB_DEFS[key];
        const isHidden = hidden.includes(key as HideableTab);
        if (reorderEnabled && !isHidden) {
          return (
            <TabTrigger key={key} name={key} href={def.href} asChild>
              <ReorderTabButton
                icon={def.icon}
                label={t(def.labelKey)}
                rail={rail}
                reorder={reorder}
                index={visibleOrder.indexOf(key)}
                tabKey={key}
                axis={rail ? 'y' : 'x'}
              />
            </TabTrigger>
          );
        }
        return (
          <TabTrigger key={key} name={key} href={def.href} asChild>
            <TabButton
              icon={def.icon}
              label={t(def.labelKey)}
              rail={rail}
              hidden={isHidden}
            />
          </TabTrigger>
        );
      })}
      <TabTrigger name="more" href="/more" asChild>
        <TabButton icon="more" label={t('tabs.more')} rail={rail} pushBottom />
      </TabTrigger>
      {/* 방 라우트: (tabs) 안에 등록만 유지(라우팅·탭바 생존)하고 바/레일에선 숨긴다.
          모든 레이아웃 분기(모바일·데스크톱·목록형)가 이 triggers()를 쓰므로 항상 등록된다. */}
      {ROOM_ROUTES.map((r) => (
        <TabTrigger key={r.name} name={r.name} href={r.href} asChild>
          <TabButton icon="chats" label="" rail={rail} hidden />
        </TabTrigger>
      ))}
      {/* 오픈소스 라이선스: 더보기 하위 페이지. 방 라우트와 같은 이유로 (tabs) 안에
          등록만 유지하고 바/레일에선 숨긴다 — 더보기처럼 목록 패널/전폭으로 렌더된다. */}
      <TabTrigger name="licenses" href="/licenses" asChild>
        <TabButton icon="more" label="" rail={rail} hidden />
      </TabTrigger>
      {/* 개인정보처리방침·이용약관은 (tabs) 밖 최상위 단독 라우트(/privacy·/terms)라
          여기 트리거로 등록하지 않는다 — 레일·탭바 크롬 없는 전폭 문서 페이지로 뜬다. */}
    </>
  );

  // ── 목록형(list) ──
  // 화면 스타일은 "테마"다 — URL/라우트는 채팅형과 동일하고 렌더만 교체한다.
  // 탭바/레일 크롬 없이 각 라우트(friends/auto/more)의 목록형 화면을 전폭으로 렌더.
  // TabList는 여전히 필요하다(Tabs 내비게이터가 어떤 라우트가 탭인지 알아야 라우팅됨) —
  // 다만 0크기·접근성 숨김으로 화면에서 치운다. 보드 자체가 세그먼트·⋯로 네비게이션한다.
  if (appStyle === 'list') {
    return (
      <Tabs style={styles.container} options={{ backBehavior: 'history' }}>
        <TabList
          style={styles.hiddenTabList}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {triggers(false, false)}
        </TabList>
        <TabSlot style={styles.slot} />
      </Tabs>
    );
  }

  // 주의: TabList는 반드시 Tabs의 "직속 자식"이어야 한다 (View로 감싸면
  // 헤드리스 파서가 트리거를 못 찾아 "no screens" 에러).
  if (isDesktop) {
    return (
      <Tabs style={styles.containerRail} options={{ backBehavior: 'history' }}>
        {/* ① 네비 레일 (상단은 워드마크 오버레이 자리) */}
        <TabList style={styles.rail}>{triggers(true, true)}</TabList>

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
            렌더 우선순위: infoScreen(라이선스) > tagAll > autoAll > tag > autoKind > room(일반).
            정보 문서는 방보다 우선하되 방 선택은 보존 — 닫으면(setInfoScreen(null)) 그 방으로 복귀한다.
            태그·자동구분·전체는 보기 전용 방. 워드마크 탭=전체. */}
        <View style={styles.chatPane}>
          {infoScreen === 'licenses' ? (
            // 라이선스 문서 — 오른쪽 상세 패널. 뒤로가기는 라우팅 대신 정보 문서만 닫아
            // (setInfoScreen(null)) 직전 방으로 돌아온다(왼쪽 더보기는 그대로).
            <LicensesScreen
              key="info:licenses"
              onBack={() => setInfoScreen(null)}
              showBack={false}
            />
          ) : tagAll ? (
            <ChatScreen
              key="tag:all"
              token={token}
              tagAll
              friendId={null}
              friendName={null}
              showBack={false}
              onBack={() => setTagAll(false)}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          ) : autoAll ? (
            <ChatScreen
              key="auto:all"
              token={token}
              autoAll
              friendId={null}
              friendName={null}
              showBack={false}
              onBack={() => setAutoAll(false)}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          ) : tag ? (
            <ChatScreen
              key={`tag:${tag.id}`}
              token={token}
              tag={tag}
              friendId={null}
              friendName={null}
              showBack={false}
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
              showBack={false}
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
              showBack={false}
              onBack={() => setRoom(null)}
              onLogout={async () => {
                await logout();
                router.replace('/login');
              }}
            />
          )}
        </View>

        {/* 워드마크 오버레이 — 탭하면 전체(자기 자신) 방으로 (홈 워드마크 관례) */}
        <View pointerEvents="box-none" style={styles.railBrandWrap}>
          <TouchableOpacity
            onPress={() => {
              setTag(null);
              setAutoKind(null);
              setRoom(null);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.myRoom')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Logo size={42} />
          </TouchableOpacity>
        </View>
      </Tabs>
    );
  }

  // 데스크톱 3패널에서 좁은 화면으로 막 넘어온 순간, 방을 보고 있었다면
  // 목록으로 튕기지 말고 그 방의 /chat 라우트로 이어준다.
  // wasDesktopRef가 "그 순간"만 한정하므로, 모바일에서 목록으로 되돌아가도
  // 다시 /chat으로 끌려가지 않는다(무한 리다이렉트 방지). room이 있을 때만.
  // 정보 문서(라이선스)를 오른쪽 패널에서 보다 좁은 화면으로 넘어오면, 그 문서의 전폭
  // 라우트로 이어준다(방 생존 규칙과 동일). infoScreen이 최우선 렌더라 방보다 먼저 검사한다.
  if (wasDesktopRef.current && infoScreen === 'licenses') {
    return <Redirect href="/licenses" />;
  }
  if (wasDesktopRef.current && tagAll) {
    return <Redirect href={{ pathname: '/tag-room', params: { tagId: 'all' } }} />;
  }
  if (wasDesktopRef.current && autoAll) {
    return <Redirect href={{ pathname: '/auto-room', params: { kind: 'all' } }} />;
  }
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
    <Tabs style={styles.container} options={{ backBehavior: 'history' }}>
      <TabSlot style={styles.slot} />
      <TabList style={styles.tabBar}>{triggers(false, true)}</TabList>
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
  // 숨긴 탭 트리거 — 등록만 유지하고 흐름 밖 0크기로 바/레일에서 뺀다.
  tabHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
    overflow: 'hidden',
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
    borderRadius: 0,
  },
  // 재정렬 래퍼(Animated.View)가 탭바에서 균등폭을 차지하도록 — 안의 Pressable(tabItem)이 채운다.
  tabItemFlex: {
    flex: 1,
  },
  // 활성 탭: 데스크톱 레일(railItemActive)과 동일 — accent 배경 잉크 채움, 라운드 0.
  tabItemActive: {
    backgroundColor: colors.accent,
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
  // 레일 폭 전체를 차지하고 가운데 정렬 — 로고가 레일 아이콘 열과 축이 맞는다(사용자 확정).
  railBrandWrap: {
    position: 'absolute',
    top: 22,
    left: 0,
    width: RAIL_WIDTH,
    alignItems: 'center',
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
