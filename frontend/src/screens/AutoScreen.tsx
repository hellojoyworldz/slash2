import { useFocusEffect } from 'expo-router';
import {
  ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  FileText,
  GripVertical,
  Link as LinkIcon,
  MapPin,
  Play,
  ShoppingBag,
  StickyNote,
} from 'lucide-react-native';
import { api, ApiError, AutoCounts, AutoKind } from '../api';
import { useAuth } from '../auth';
import { resolveAutoOrder } from '../auto-filter';
import { TabHeader } from '../components/TabHeader';
import { Text } from '../components/Text';
import { useSelectedRoom } from '../selected-room';
import { grabCursor, ReorderRow, useReorder } from '../use-reorder';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// lucide 아이콘 컴포넌트 타입(색·크기는 호출부가 결정) — SwipeableRow와 같은 표기.
type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

// 자동구분 6종 아이콘. 이름은 i18n(auto.names.<key>), 순서는 users.autoOrder(없으면 기본).
// 아이콘 타일은 무채색(surface 채움 + ink 아이콘) — 자동구분은 색을 갖지 않는다(색은 분류의 것).
const AUTO_ICONS: Record<AutoKind, IconComponent> = {
  place: MapPin,
  video: Play,
  item: ShoppingBag,
  article: FileText,
  memo: StickyNote,
  link: LinkIcon,
};

// 행 높이 균일(그립 드래그 재정렬의 전제) — tile 44 + 세로 패딩.
const ROW_HEIGHT = 68;

interface Props {
  token: string | null;
  onOpenAuto: (kind: AutoKind) => void;
  onLogout: () => void;
}

export function AutoScreen({ token, onOpenAuto, onLogout }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 데스크톱 스플릿뷰에서만 현재 선택된 자동구분을 강조한다.
  const { autoKind } = useSelectedRoom();
  // 자동구분 순서(사용자 순서 우선) + 저장 후 컨텍스트 갱신.
  const { autoOrder, setAutoOrder } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  const [counts, setCounts] = useState<AutoCounts | null>(null);
  // 화면에 보이는 순서(드래그 낙관 반영). 컨텍스트 autoOrder가 바뀌면 동기화.
  const [order, setOrder] = useState<AutoKind[]>(() => resolveAutoOrder(autoOrder));
  const orderRef = useRef<string[]>(order);
  orderRef.current = order;

  useEffect(() => {
    const next = resolveAutoOrder(autoOrder);
    setOrder(next);
    orderRef.current = next;
  }, [autoOrder]);

  const tokenRef = useRef(token);
  tokenRef.current = token;

  // 확정된 순서를 낙관적으로 반영(컨텍스트 → 칩·보드·탭 전파) + 서버 저장.
  // 엔드포인트 미배포/실패여도 로컬(컨텍스트)은 유지한다(조용히) — 세션 내 재정렬 보존.
  const commitOrder = useCallback(
    (ids: string[]) => {
      const next = ids as AutoKind[];
      setOrder(next);
      setAutoOrder(next);
      const tk = tokenRef.current;
      if (tk) api.updateProfile(tk, { autoOrder: next }).catch(() => {});
    },
    [setAutoOrder],
  );

  const reorder = useReorder({ rowHeight: ROW_HEIGHT, orderRef, onCommit: commitOrder });

  // 탭 진입 시마다 개수 갱신(방에서 돌아오면 최신 반영).
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      let cancelled = false;
      (async () => {
        try {
          const data = await api.autoCounts(token);
          if (!cancelled) setCounts(data);
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) onLogout();
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [token, onLogout]),
  );

  return (
    <View style={styles.container}>
      <TabHeader title={t('auto.title')} />

      <FlatList
        data={order}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.listContent}
        scrollEnabled={reorder.draggingId === null}
        extraData={reorder.draggingId}
        renderItem={({ item, index }) => {
          const Icon = AUTO_ICONS[item];
          const active = isDesktop && autoKind === item;
          const isDragging = reorder.draggingId === item;
          // 개수는 0이어도 행을 보여주고 0으로 표기(여섯 키 항상 존재).
          const count = counts?.[item] ?? 0;
          return (
            <ReorderRow index={index} isDragging={isDragging} controls={reorder}>
              <View
                style={[
                  styles.row,
                  active && styles.rowActive,
                  isDragging && styles.rowLifted,
                ]}
              >
                <TouchableOpacity
                  style={styles.rowMain}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onOpenAuto(item)}
                >
                  <View style={styles.tile}>
                    <Icon size={22} strokeWidth={2} color={colors.ink} />
                  </View>
                  <Text variant="subheading" style={styles.name} numberOfLines={1}>
                    {t(`auto.names.${item}`)}
                  </Text>
                  <Text variant="micro" color={colors.textTertiary}>
                    {count}
                  </Text>
                </TouchableOpacity>
                {/* 그립 = 세로 드래그 재정렬(분류 탭과 동일 문법). */}
                <GestureDetector gesture={reorder.getGesture(item)}>
                  <View
                    style={[styles.dragHandle, grabCursor]}
                    accessibilityRole="adjustable"
                    accessibilityLabel={t('a11y.reorder')}
                    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
                    onAccessibilityAction={(e) =>
                      reorder.moveByOne(
                        item,
                        e.nativeEvent.actionName === 'increment' ? -1 : 1,
                      )
                    }
                  >
                    <GripVertical size={18} strokeWidth={2} color={colors.textTertiary} />
                  </View>
                </GestureDetector>
              </View>
            </ReorderRow>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      paddingTop: 4,
      paddingBottom: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      height: ROW_HEIGHT,
      paddingHorizontal: 20,
      backgroundColor: colors.background,
    },
    // 데스크톱 선택 행 — 연회색 면으로 강조(채팅·분류 탭과 동일 문법).
    rowActive: {
      backgroundColor: colors.surface,
    },
    // 드래그로 들린 행: surface 채움 + 1px ink 보더(선택 표시 문법). 그림자 금지.
    rowLifted: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.ink,
    },
    rowMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    // 무채색 아이콘 타일(보더 없음) — 색은 분류의 것이라 자동구분은 색을 갖지 않는다.
    tile: {
      width: 44,
      height: 44,
      borderRadius: 0,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      flex: 1,
      marginLeft: 14,
      marginRight: 10,
    },
    dragHandle: {
      alignSelf: 'stretch',
      alignItems: 'center',
      justifyContent: 'center',
      paddingLeft: 12,
      paddingRight: 2,
    },
  });
