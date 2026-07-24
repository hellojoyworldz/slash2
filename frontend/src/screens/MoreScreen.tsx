import {
  ComponentType,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import {
  Asterisk,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Hash,
  LayoutGrid,
  EllipsisVertical,
  MessageSquare,
  Slash,
} from 'lucide-react-native';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { PRIVACY_ROUTE, TERMS_ROUTE } from '../legal';
import { api, HideableTab, TabKey } from '../api';
import { AppStyle, useAppStyle } from '../app-style';
import { useAuth } from '../auth';
import { AppleLogo } from '../components/AppleLogo';
import { Button } from '../components/Button';
import { GoogleLogo } from '../components/GoogleLogo';
import { KakaoLogo } from '../components/KakaoLogo';
import { Logo } from '../components/Logo';
import { NaverLogo } from '../components/NaverLogo';
import { Text } from '../components/Text';
import { useNameEdit } from '../name-edit';
import {
  isHideableTab,
  resolveHiddenTabs,
  resolveTabOrder,
} from '../tab-menu';
import { useSelectedRoom } from '../selected-room';
import { rowFill } from '../row-hover';
import { ReorderRow, useReorder } from '../use-reorder';
import {
  LANGUAGE_NAMES,
  Language,
  setLanguage,
  SUPPORTED_LANGUAGES,
} from '../i18n';
import { layout, ThemeColors } from '../theme';
import { ThemeMode, useTheme } from '../theme-context';

// lucide 아이콘 컴포넌트 타입(색·크기는 호출부가 결정) — AutoScreen과 같은 표기.
type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

// 메뉴(탭) 5종의 아이콘·라벨 — (tabs)/_layout.tsx의 트리거 정의와 같은 매핑을 재사용한다.
// (categories 라우트는 역사적 사정으로 라벨 키가 tabs.friends='분류'.)
const MENU_ICONS: Record<TabKey, IconComponent> = {
  friends: LayoutGrid,
  chats: MessageSquare,
  categories: Slash,
  tags: Hash,
  auto: Asterisk,
};
const MENU_LABEL_KEYS: Record<TabKey, string> = {
  friends: 'tabs.group',
  chats: 'tabs.chats',
  categories: 'tabs.friends',
  tags: 'tabs.tags',
  auto: 'tabs.auto',
};
// 행 높이 균일(그립 드래그 재정렬의 전제) — AutoScreen과 같은 관례.
const MENU_ROW_HEIGHT = 52;

// 다크모드 3택. key는 setMode에 그대로 전달.
const MODE_OPTIONS: { key: ThemeMode; labelKey: string }[] = [
  { key: 'light', labelKey: 'more.modeLight' },
  { key: 'dark', labelKey: 'more.modeDark' },
  { key: 'system', labelKey: 'more.modeSystem' },
];

// 화면 스타일 2택. 앱 전체 컨셉(채팅형/목록형)을 가른다 — 선택 즉시 해당 그룹으로 이동.
const APP_STYLE_OPTIONS: { key: AppStyle; labelKey: string }[] = [
  { key: 'chat', labelKey: 'appStyle.chat' },
  { key: 'list', labelKey: 'appStyle.list' },
];

interface Props {
  email: string;
  displayName: string | null;
  // 연결된 소셜 provider 목록 (예: ['google']). 이메일 옆 배지 표시용.
  providers: string[];
  onLogout: () => void;
  // 헤더 타이틀 왼쪽 슬롯(예: 목록형 더보기의 뒤로가기). 탭바가 있는 채팅형에선 생략.
  leading?: ReactNode;
}

export function MoreScreen({
  email,
  displayName,
  providers,
  onLogout,
  leading,
}: Props) {
  const { t, i18n } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const { appStyle, setAppStyle } = useAppStyle();
  const router = useRouter();
  const { width } = useWindowDimensions();

  // 앱 버전 — expo-constants. 네이티브 빌드 번호가 있으면 괄호로 덧붙인다(웹은 없음).
  const appVersion = Constants.expoConfig?.version ?? '—';
  const buildVersion = Constants.nativeBuildVersion;
  const versionText = buildVersion ? `${appVersion} (${buildVersion})` : appVersion;
  // 데스크톱은 레일에 심볼이 이미 있어 중복 금지 — 모바일(< desktopBreakpoint)에서만 로고 노출.
  const isMobile = width < layout.desktopBreakpoint;
  // 데스크톱 3패널(채팅형·≥900)에서만 오른쪽 상세 패널이 존재한다 — 라이선스는 여기로 띄운다.
  const desktopSplit = !isMobile && appStyle === 'chat';
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const current = i18n.language as Language;
  // 오른쪽 상세 패널에 라이선스 문서를 띄우는 루트 상태(방 선택과 같은 문법, 900px 스왑 생존).
  const { setInfoScreen } = useSelectedRoom();

  // 화면 스타일 전환 — 라우트 점프 없이 상태만 바꾼다. 두 스타일이 URL을 공유하므로
  // 현재 주소가 그대로 유효하다((tabs) 레이아웃과 각 라우트가 스타일에 맞게 렌더를 교체).
  // 예외적으로 /chats·채팅방처럼 목록형에 개념이 없는 라우트는 각 라우트가 /friends로 리다이렉트한다.
  const changeAppStyle = (key: AppStyle) => {
    if (key === appStyle) return;
    setAppStyle(key);
  };
  // 표시 이름이 없으면 이메일 앞부분으로 폴백
  const name = displayName || email.split('@')[0] || t('common.me');

  // 이름 편집: 연필 아이콘 → 루트 상주 오버레이 (900px 교차 리마운트에도 유지)
  const { openNameEditor } = useNameEdit();

  // ── 메뉴(탭) 커스터마이즈 ── 순서·노출은 로그인 상태(컨텍스트)에서 읽어 저장한다.
  // AutoScreen의 자동구분 재정렬 문법을 그대로 미러링(드래그 낙관 반영 + 서버 저장).
  const { token, tabOrder, hiddenTabs, setTabOrder, setHiddenTabs } = useAuth();
  const menuResolved = useMemo(() => resolveTabOrder(tabOrder), [tabOrder]);
  const hiddenSet = useMemo(() => resolveHiddenTabs(hiddenTabs), [hiddenTabs]);

  // 화면에 보이는 순서(드래그 낙관 반영). 컨텍스트 tabOrder가 바뀌면 동기화.
  const [menuOrder, setMenuOrder] = useState<TabKey[]>(menuResolved);
  const menuOrderRef = useRef<string[]>(menuOrder);
  menuOrderRef.current = menuOrder;
  useEffect(() => {
    setMenuOrder(menuResolved);
    menuOrderRef.current = menuResolved;
  }, [menuResolved]);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  // 확정된 순서를 낙관적으로 반영(컨텍스트 → 탭바/레일 전파) + 서버 저장. 실패 시 이전 순서로 복원.
  const commitMenuOrder = useCallback(
    (ids: string[]) => {
      const next = ids as TabKey[];
      const prev = menuOrderRef.current as TabKey[];
      setMenuOrder(next);
      setTabOrder(next);
      const tk = tokenRef.current;
      if (tk) {
        api.updateProfile(tk, { tabOrder: next }).catch(() => {
          setMenuOrder(prev);
          setTabOrder(prev);
        });
      }
    },
    [setTabOrder],
  );

  // 웹 마우스 hover된 탭편집 행(key) — surface로 강조.
  const [hoveredMenuKey, setHoveredMenuKey] = useState<string | null>(null);
  const reorder = useReorder({
    rowHeight: MENU_ROW_HEIGHT,
    orderRef: menuOrderRef,
    onCommit: commitMenuOrder,
    onHover: (key, h) => setHoveredMenuKey(h ? key : null),
  });

  // 노출/숨김 토글(분류·태그·자동구분만). 낙관 반영 + 실패 시 직전 값으로 복원.
  const toggleHidden = useCallback(
    (key: HideableTab) => {
      const currently = hiddenSet.includes(key);
      const next = currently
        ? hiddenSet.filter((k) => k !== key)
        : [...hiddenSet, key];
      const prev = hiddenTabs ?? null;
      setHiddenTabs(next);
      if (token) {
        api.updateProfile(token, { hiddenTabs: next }).catch(() => setHiddenTabs(prev));
      }
    },
    [hiddenSet, hiddenTabs, setHiddenTabs, token],
  );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        // 메뉴 행을 드래그하는 동안엔 바깥 스크롤을 멈춰 제스처 충돌을 막는다.
        scrollEnabled={reorder.draggingId === null}
      >
        <View style={styles.header}>
          {leading ? <View style={styles.headerLeading}>{leading}</View> : null}
          <View style={styles.titleRow}>
            {isMobile ? <Logo size={38} /> : null}
            <Text variant="title">{t('more.title')}</Text>
          </View>
        </View>

        {/* 프로필 — 연필을 누르면 이름 편집 오버레이 */}
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Text variant="heading" color={colors.inverse}>
              {name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.profileInfo}>
            <Text variant="heading">{name}</Text>
            <View style={styles.emailRow}>
              <Text
                variant="label"
                color={colors.textSecondary}
                numberOfLines={1}
                style={styles.emailText}
              >
                {email || t('more.needLogin')}
              </Text>
              {providers.includes('google') && (
                <View
                  style={styles.providerBadge}
                  accessibilityRole="image"
                  accessibilityLabel={t('more.linkedGoogle')}
                >
                  <GoogleLogo size={15} />
                </View>
              )}
              {providers.includes('apple') && (
                <View
                  style={styles.providerBadge}
                  accessibilityRole="image"
                  accessibilityLabel={t('more.linkedApple')}
                >
                  <AppleLogo size={15} color={colors.textPrimary} />
                </View>
              )}
              {providers.includes('kakao') && (
                <View
                  style={styles.providerBadge}
                  accessibilityRole="image"
                  accessibilityLabel={t('more.linkedKakao')}
                >
                  <KakaoLogo size={15} color={colors.textPrimary} />
                </View>
              )}
              {providers.includes('naver') && (
                <View
                  style={styles.providerBadge}
                  accessibilityRole="image"
                  accessibilityLabel={t('more.linkedNaver')}
                >
                  <NaverLogo size={15} color={colors.textPrimary} />
                </View>
              )}
            </View>
          </View>
          <TouchableOpacity
            onPress={openNameEditor}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('more.editName')}
          >
            <EllipsisVertical size={18} strokeWidth={2} color={colors.textTertiary} />
          </TouchableOpacity>
        </View>

        {/* 테마 — 라이트/다크/시스템 */}
        <View style={styles.sectionCard}>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            {t('more.theme')}
          </Text>
          <View style={styles.pillRow}>
            {MODE_OPTIONS.map(({ key, labelKey }) => {
              const active = mode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setMode(key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <Text
                    variant="label"
                    color={active ? colors.onAccent : colors.textSecondary}
                  >
                    {t(labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 언어 */}
        <View style={styles.sectionCard}>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            {t('more.language')}
          </Text>
          <View style={styles.pillRow}>
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = current === lang;
              return (
                <TouchableOpacity
                  key={lang}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => void setLanguage(lang)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <Text
                    variant="label"
                    color={active ? colors.onAccent : colors.textSecondary}
                  >
                    {LANGUAGE_NAMES[lang]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 화면 스타일 — 채팅형/목록형 (언어 스위처와 같은 UI 문법). 선택 즉시 전환·이동. */}
        <View style={styles.sectionCard}>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            {t('appStyle.title')}
          </Text>
          <View style={styles.pillRow}>
            {APP_STYLE_OPTIONS.map(({ key, labelKey }) => {
              const active = appStyle === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => changeAppStyle(key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  hitSlop={{ top: 6, bottom: 6 }}
                >
                  <Text
                    variant="label"
                    color={active ? colors.onAccent : colors.textSecondary}
                  >
                    {t(labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 메뉴(탭) — 순서 변경(그립 드래그·접근성 이동) + 노출 토글(분류·태그·자동구분).
            그룹·채팅은 항상 노출(토글 없음), 더보기는 순서 밖·항상 맨끝이라 목록에 없다. */}
        <View style={styles.sectionCard}>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            {t('more.menu')}
          </Text>
          <View>
            {menuOrder.map((key, index) => {
              const Icon = MENU_ICONS[key];
              const hideable = isHideableTab(key);
              const isHidden = hideable && hiddenSet.includes(key);
              const isDragging = reorder.draggingId === key;
              const label = t(MENU_LABEL_KEYS[key]);
              const fg = isHidden ? colors.textTertiary : colors.ink;
              return (
                <ReorderRow
                  key={key}
                  index={index}
                  isDragging={isDragging}
                  controls={reorder}
                >
                  {/* 행 전체를 꾹 눌러 세로로 끌면 재정렬(그립 없음). 눈 토글은 빠른 탭으로 그대로 동작. */}
                  <GestureDetector gesture={reorder.getGesture(key)}>
                    <View
                      style={[
                        styles.menuRow,
                        rowFill(colors, { hovered: hoveredMenuKey === key }),
                        isDragging && styles.menuRowLifted,
                      ]}
                    >
                      {/* 라벨 영역 = 재정렬 접근성 요소(위/아래 이동) — 예전 그립이 갖던 a11y를 행에 통합. */}
                      <View
                        style={styles.menuLabelArea}
                        accessible
                        accessibilityRole="adjustable"
                        accessibilityLabel={label}
                        accessibilityActions={[
                          { name: 'increment', label: t('a11y.moveUp') },
                          { name: 'decrement', label: t('a11y.moveDown') },
                        ]}
                        onAccessibilityAction={(e) =>
                          reorder.moveByOne(
                            key,
                            e.nativeEvent.actionName === 'increment' ? -1 : 1,
                          )
                        }
                      >
                        <View style={styles.menuTile}>
                          <Icon size={20} strokeWidth={2} color={fg} />
                        </View>
                        <Text
                          variant="label"
                          color={fg}
                          style={styles.menuLabel}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </View>
                      {hideable ? (
                        <TouchableOpacity
                          style={styles.menuToggle}
                          onPress={() => toggleHidden(key)}
                          activeOpacity={0.6}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: !isHidden }}
                          accessibilityLabel={label}
                        >
                          {isHidden ? (
                            <EyeOff size={18} strokeWidth={2} color={colors.textTertiary} />
                          ) : (
                            <Eye size={18} strokeWidth={2} color={colors.ink} />
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.menuToggle} />
                      )}
                    </View>
                  </GestureDetector>
                </ReorderRow>
              );
            })}
          </View>
        </View>

        {/* 앱 정보 — 고정 하단 섹션(재정렬 대상 아님). 버전(비대화형) +
            오픈소스 라이선스·개인정보처리방침·이용약관(모두 내부 화면으로 이동). */}
        <View style={styles.sectionCard}>
          <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
            {t('more.appInfo')}
          </Text>

          {/* 버전 — 표시 전용(누를 수 없음) */}
          <View style={styles.infoRow} accessible accessibilityRole="text">
            <Text variant="label" style={styles.infoLabel}>
              {t('more.version')}
            </Text>
            <Text variant="micro" color={colors.textTertiary}>
              {versionText}
            </Text>
          </View>

          {/* 오픈소스 라이선스 — 데스크톱 3패널은 오른쪽 상세 패널에(더보기는 왼쪽 유지),
              모바일·목록형은 전폭 라우트로. 방 목록 행(ChatsScreen)의 desktop/mobile 문법과 동일. */}
          <Pressable
            style={({ hovered, pressed }) => [
              styles.infoRow,
              rowFill(colors, { hovered, pressed }),
            ]}
            onPress={() => {
              if (desktopSplit) setInfoScreen('licenses');
              else router.push('/licenses');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('more.openSourceLicenses')}
          >
            <Text variant="label" style={styles.infoLabel}>
              {t('more.openSourceLicenses')}
            </Text>
            <ChevronRight size={18} strokeWidth={2} color={colors.textTertiary} />
          </Pressable>

          {/* 개인정보처리방침 — 내부 화면으로 이동 */}
          <Pressable
            style={({ hovered, pressed }) => [
              styles.infoRow,
              rowFill(colors, { hovered, pressed }),
            ]}
            onPress={() => router.push(PRIVACY_ROUTE)}
            accessibilityRole="button"
            accessibilityLabel={t('more.privacyPolicy')}
          >
            <Text variant="label" style={styles.infoLabel}>
              {t('more.privacyPolicy')}
            </Text>
            <ExternalLink size={18} strokeWidth={2} color={colors.textTertiary} />
          </Pressable>

          {/* 이용약관 — 내부 화면으로 이동 */}
          <Pressable
            style={({ hovered, pressed }) => [
              styles.infoRow,
              rowFill(colors, { hovered, pressed }),
            ]}
            onPress={() => router.push(TERMS_ROUTE)}
            accessibilityRole="button"
            accessibilityLabel={t('more.terms')}
          >
            <Text variant="label" style={styles.infoLabel}>
              {t('more.terms')}
            </Text>
            <ExternalLink size={18} strokeWidth={2} color={colors.textTertiary} />
          </Pressable>
        </View>

        {/* 보조 액션이라 outline */}
        <Button
          label={t('more.logout')}
          variant="outline"
          onPress={onLogout}
          style={styles.logoutBtn}
        />
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: layout.bottomPad + 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: layout.statusBarPad + 4,
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  headerLeading: {
    marginRight: 8,
    marginLeft: -6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 0,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
    gap: 6,
  },
  emailText: {
    flexShrink: 1,
  },
  providerBadge: {
    // 채움 없는 작은 표식 — 조용하게
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 면적 구분: 보더 없는 surface 카드 (BAT 레퍼런스 문법)
  sectionCard: {
    backgroundColor: colors.surface,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 10,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // 카드 위라 비활성 pill은 흰 배경으로 살짝 떠 보이게
  pill: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  pillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  // ── 메뉴(탭) 행 ── 균일 높이(드래그 재정렬의 전제). 카드 위라 배경은 투명.
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: MENU_ROW_HEIGHT,
  },
  // 드래그로 들린 행: background 채움 + 1px ink 보더(선택 표시 문법). 그림자 금지.
  menuRowLifted: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  // 무채색 아이콘 타일(보더 없음) — 메뉴 아이콘은 색을 갖지 않는다(색은 분류의 것).
  menuTile: {
    width: 36,
    height: 36,
    borderRadius: 0,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 아이콘+라벨 영역 — 남는 폭을 채우고(눈 토글은 고정 폭) 재정렬 접근성 요소를 겸한다.
  menuLabelArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuLabel: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  // 눈 아이콘 토글(분류·태그·자동구분). 항상 노출 행에선 빈 View로 자리만 맞춘다.
  menuToggle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── 앱 정보 행 ── 라벨(좌) + 값/아이콘(우). 카드 위라 배경 투명, 균일 높이.
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 4,
  },
  infoLabel: {
    flex: 1,
    marginRight: 12,
  },
  logoutBtn: {
    marginHorizontal: 20,
    marginTop: 24,
  },
});
