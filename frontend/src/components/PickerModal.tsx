import {
  cloneElement,
  createContext,
  isValidElement,
  ReactElement,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useReducedMotion } from 'react-native-reanimated';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useModalA11yFocus } from '../use-a11y-focus';
import { useVarReorder, VarReorderControls, VarReorderRow } from '../use-reorder';
import { Button } from './Button';
import {
  SwipeableRow,
  SwipeableRowMethods,
  SwipeAction,
  SwipeActionsA11y,
  useSwipeActionsA11y,
} from './SwipeableRow';
import { Text } from './Text';

// 픽커 안에서 "특정 항목으로 스크롤"을 위한 배선. 각 행이 스크롤 콘텐츠 기준 자기 y offset을
// register(key, y)로 등록하고(onLayout), PickerModal이 scrollToKey가 가리키는 offset으로 스크롤한다.
// - 추가 직후: 새 항목 key로 스크롤(어디에 들어가든 보이게).
// - 열릴 때 선택 항목이 있으면: 그 항목 key로 스크롤(목록이 길어 화면 밖일 때).
interface PickerScrollCtx {
  register: (key: string, y: number) => void;
}
const PickerScrollContext = createContext<PickerScrollCtx | null>(null);
// 스크롤 타깃 offset 등록은 PickerReorderRow(행의 바깥 래퍼 = ScrollView content 직계 자식)에서
// 한다 — 그 View의 layout.y만이 스크롤 콘텐츠 기준이라 정확하다. (행 안쪽 Pressable의 onLayout은
// 자기 부모 기준이라 재정렬·스와이프 래퍼로 감싼 뒤엔 어긋난다.)

// 픽커 목록 "드래그 순서 변경" 배선. 본 목록(분류·태그)과 같은 리스트 문법을 픽커 안 ScrollView로
// 옮긴 것 — 꾹(250ms) 눌러 세로 드래그, 잡은 행 들림(LIFT), 이동 기반 hop, 놓을 때 1회 커밋.
// PickerModal이 컨트롤을 만들어 컨텍스트로 내려주고, 각 픽커가 재정렬 대상 행을 PickerReorderRow로
// 감싼다. 커밋(본 목록과 같은 순서 API·낙관 반영)은 각 픽커가 reorder.onReorder로 준다.
interface PickerReorderCtx {
  /** 재정렬 대상 key들의 현재 표시 순서(index 계산의 원천). */
  order: string[];
  controls: VarReorderControls;
  /** 각 행이 자기 실측 높이를 등록(가변 높이 hop 계산에 쓴다). */
  registerHeight: (key: string, h: number) => void;
}
const PickerReorderContext = createContext<PickerReorderCtx | null>(null);

// 드래그 세션 직후 따라오는 자식 DOM click(행 탭 → 선택/수정, 휴지통 삭제)을 눌러 무시하는 가드.
// 반환 함수가 true면 "지금 무시하라"(드래그 세션 중/직후). 재정렬 컨텍스트 밖(예: 전체(미분류) 행,
// 재정렬 비활성)에서는 항상 false라 평소 탭은 그대로 동작한다. 탭 재정렬 didDragRef와 같은 패턴.
// 꾹 눌렀다 이동 없이 뗀 승격 탭은 onFinalize가 onActivate로 직접 발화하므로, 이 가드가 막아도
// 이중 발화 없이 한 번만 동작한다(자식 click은 여기서 막고, 승격은 우회 경로로).
export function usePickerReorderGuard() {
  const ctx = useContext(PickerReorderContext);
  return useCallback(() => ctx?.controls.didDragRef.current ?? false, [ctx]);
}

// 픽커 행 왼→오 스와이프 액션([수정][삭제]) 배선 — 본 목록(분류·태그 탭)의 스와이프 문법을 픽커 안으로
// 옮긴 것. 본 목록처럼 "한 번에 한 행만 열림"(다른 행 스와이프 시 이전 행 닫기) + "드래그 직후 오탭 무시"를
// 모달 레벨의 refs로 조정한다. PickerModal이 컨텍스트를 내려주고, PickerReorderRow가 대상 행을
// SwipeableRow로 감싼다. 스와이프(가로)·세로 드래그(재정렬)·탭(선택/수정)은 본 목록과 같은 방향·타이밍
// 규칙(withDragActivation: activeOffsetY ±6 + failOffsetX ±12, 스와이프: activeOffsetX ±10)으로 공존한다.
interface PickerSwipeCtx {
  /** SwipeableRow 메서드 등록(닫기 명령용). null이면 해제(언마운트). */
  register: (key: string, methods: SwipeableRowMethods | null) => void;
  /** 열림/닫힘 알림 — 열리면 이전에 열린 행을 닫는다(한 번에 하나만). */
  onOpenChange: (key: string, open: boolean) => void;
  /** 스와이프 드래그 시작/끝 알림(끝나고 잠깐 뒤 false) — 드래그 직후 오탭 무시용. */
  setDragging: (dragging: boolean) => void;
  /** 지금 스와이프 드래그 중(직후 포함)인가 — 행 탭 가드. */
  isDragging: () => boolean;
  /** 이 행이 현재 열려 있는가. */
  isOpen: (key: string) => boolean;
  /** 이 행의 스와이프를 닫는다. */
  closeRow: (key: string) => void;
}
const PickerSwipeContext = createContext<PickerSwipeCtx | null>(null);

// 행 탭(선택/수정) 직전에 부르는 스와이프 가드. 반환 true면 "이 탭은 무시하라":
//  · 스와이프 드래그 직후(오탭) → 무시.
//  · 이 행이 이미 열려 있으면 → 스와이프를 닫고 탭을 무시(본 목록 openRow와 같은 규칙).
// 스와이프 컨텍스트 밖(예: '전체(미분류)' 행)이나 key가 없으면 항상 false라 평소 탭은 그대로 동작한다.
export function usePickerSwipeTapGuard(rowKey?: string) {
  const ctx = useContext(PickerSwipeContext);
  return useCallback(() => {
    if (!ctx || !rowKey) return false;
    if (ctx.isDragging()) return true;
    if (ctx.isOpen(rowKey)) {
      ctx.closeRow(rowKey);
      return true;
    }
    return false;
  }, [ctx, rowKey]);
}

// 재정렬 대상 행 래퍼 — 본 목록의 (Var)ReorderRow + 롱프레스 드래그 제스처를 픽커 행에 씌운다.
// reorder가 없거나(비활성) 이 key가 순서 목록에 없으면(예: 전체(미분류) 행) 그대로 자식만 렌더.
// 행 기존 상호작용(탭=선택/수정, 휴지통 삭제)은 자식(PickerRow) 내부 Pressable이 그대로 처리하고,
// 드래그는 250ms 롱프레스 뒤에만 활성돼 Race로 공존한다(리스트 문법 그대로).
export function PickerReorderRow({
  rowKey,
  swipeActions,
  children,
}: {
  rowKey: string;
  /** 왼→오 스와이프로 드러나는 액션([수정][삭제]). 없으면 스와이프 없음('전체' 행 등 비대상은 애초에 미감쌈). */
  swipeActions?: SwipeAction[];
  children: ReactNode;
}) {
  const ctx = useContext(PickerReorderContext);
  const swipe = useContext(PickerSwipeContext);
  const scroll = useContext(PickerScrollContext);
  // 이 래퍼 View는 ScrollView content의 직계 자식이라 layout.y가 스크롤 콘텐츠 기준 offset이다
  // (행 안쪽 Pressable의 onLayout은 자기 부모 기준이라 재정렬·스와이프 래퍼로 감싼 뒤엔 ~0으로
  // 어긋난다 — 그래서 스크롤 타깃 offset 등록은 반드시 이 바깥 View에서 한다). 높이(재정렬 hop용)도
  // 같이 등록한다.
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      ctx?.registerHeight(rowKey, e.nativeEvent.layout.height);
      scroll?.register(rowKey, e.nativeEvent.layout.y);
    },
    [ctx, scroll, rowKey],
  );
  // 스크린리더 대안: 스와이프 액션을 행 터처블(자식)의 접근성 커스텀 액션으로 주입한다.
  // 자식(PickerRow·관리 행)이 accessibilityActions/onAccessibilityAction을 받아 자기 터처블에 얹는다.
  const a11y = useSwipeActionsA11y(swipeActions ?? []);
  const withA11y = (node: ReactNode): ReactNode =>
    swipeActions && swipeActions.length > 0 && isValidElement(node)
      ? cloneElement(node as ReactElement<Partial<SwipeActionsA11y>>, { ...a11y })
      : node;
  const accessibleChild = withA11y(children);
  // 본 목록과 같은 배치: (Var)ReorderRow > SwipeableRow > GestureDetector(세로 드래그) > 행.
  // 스와이프 컨텍스트·액션이 있을 때만 SwipeableRow로 감싼다(없으면 그대로 — 스와이프 없는 행).
  const withSwipe = (inner: ReactNode): ReactNode =>
    swipe && swipeActions && swipeActions.length > 0 ? (
      <SwipeableRow
        ref={(r) => swipe.register(rowKey, r)}
        actions={swipeActions}
        onDragStateChange={(dragging) => swipe.setDragging(dragging)}
        onOpenChange={(open) => swipe.onOpenChange(rowKey, open)}
      >
        {inner}
      </SwipeableRow>
    ) : (
      inner
    );
  // 재정렬 비대상(ctx 없음 / order 밖 rowKey)이어도 스크롤 offset은 등록해야 하므로 바깥 View로 감싼다.
  if (!ctx) return <View onLayout={onLayout}>{withSwipe(accessibleChild)}</View>;
  const index = ctx.order.indexOf(rowKey);
  if (index < 0) return <View onLayout={onLayout}>{withSwipe(accessibleChild)}</View>;
  const isDragging = ctx.controls.draggingId === rowKey;
  return (
    // 잡은 행은 이 래퍼(형제 래퍼들과 같은 레벨)를 z-lift해 이웃 위로 올린다 — 내부 LIFT zIndex는
    // 한 단계 안쪽이라 형제 래퍼를 못 넘으므로 래퍼 자체를 든다(그림자 금지, z만).
    <View onLayout={onLayout} style={isDragging ? reorderRowStyles.reorderLifted : undefined}>
      <VarReorderRow index={index} isDragging={isDragging} controls={ctx.controls}>
        {withSwipe(
          // GestureDetector의 직계 자식은 host ref를 줘야 한다(웹에서 DOM 노드 부착) —
          // PickerRow류는 일반 함수 컴포넌트라 ref가 없으므로 View로 감싼다.
          <GestureDetector gesture={ctx.controls.getGesture(rowKey)}>
            <View collapsable={false}>{accessibleChild}</View>
          </GestureDetector>,
        )}
      </VarReorderRow>
    </View>
  );
}

const reorderRowStyles = StyleSheet.create({
  reorderLifted: { zIndex: 10, elevation: 10 },
});

// 메시지 ⋮ 메뉴에서 뜨는 두 픽커(분류·태그)의 공용 골격.
// ModalCard의 시각 문법(연한 스크림 + 중앙 카드 1px border·라운드 0·bg background·폭 360)을
// 재현한다. "고르기 → 저장" 방식: 행 탭은 로컬 선택만 바꾸고, 푸터의 공용 Button
// [취소(ghost)][저장(primary)]가 확정 지점이다 — 취소·스크림·Esc·뒤로가기는 모두 onClose로
// 선택을 버리고 닫는다(별도 되돌리기 로직 불필요 — 애초에 반영을 안 했으니까).
// 상단은 [텍스트 입력 + 추가] 한 줄(신규 항목 생성 — 생성 자체는 즉시, 선택 반영은 각 픽커가 로컬로).
// Esc·Android 뒤로가기·스크림 탭 닫기와 a11y(dialog)를 여기서 공통 처리한다.
export const PICKER_TILE_SIZE = 44;

interface PickerModalProps {
  visible: boolean;
  title: string;
  /** 취소·스크림·Esc·뒤로가기 — 선택을 버리고 닫는다(PATCH 없음). */
  onClose: () => void;
  /** 상단 입력줄 — 신규 항목 이름. */
  newName: string;
  onChangeNewName: (v: string) => void;
  /** [추가] 또는 입력 제출 시 호출. */
  onAdd: () => void;
  addPlaceholder: string;
  /** 생성 진행 중 — 입력 잠금 + 버튼 스피너. */
  adding: boolean;
  addLabel: string;
  cancelLabel: string;
  saveLabel: string;
  /** [저장] — 로컬 선택을 PATCH. 진행 중엔 버튼 스피너 + 취소도 잠근다(레이스 방지). */
  onSave: () => void;
  saving: boolean;
  /** 관리 모드처럼 확정 액션이 없을 때: 밑줄(ghost) [닫기] 하나만 둔다.
   *  (버튼 색 규칙 — 검정 채움은 상태를 확정·변경하는 버튼에만. 닫기/취소는 항상 ghost.) */
  closeOnly?: boolean;
  /** 추가 폼의 '설명 (선택)' 입력. 넘길 때만 렌더(분류 선택 픽커는 항상 넘김, 필요 없는 픽커는 생략). */
  newDescription?: string;
  onChangeNewDescription?: (v: string) => void;
  descriptionPlaceholder?: string;
  /** 추가 폼 전용 슬롯 — 설명 아래·[추가] 버튼 위에 렌더(현재 태그 픽커의 키워드 스테퍼).
   *  키워드는 태그 전용이라 분류 픽커는 넘기지 않아 표시되지 않는다. */
  addExtra?: ReactNode;
  /** 추가 폼 접이식 섹션 — "목록" 섹션과 같은 문법(헤더 탭으로 펼침/접힘). 접힘 상태는
   *  호출부가 useCollapsedSections로 서버 저장(키: picker.categories.add / picker.tags.add). */
  addExpanded: boolean;
  onToggleAddExpanded: () => void;
  /** "목록" 섹션 접이식 헤더 — 스크롤 밖(고정)에 PickerModal이 직접 렌더한다. 목록이 길어 행들이
   *  스크롤돼도 헤더는 항상 보인다. 접힘 상태는 호출부가 서버 저장(키: picker.categories / picker.tags),
   *  개수(listCount)는 라벨 옆에 표시. children(행들)은 호출부가 listExpanded로 게이팅해 넘긴다. */
  listExpanded: boolean;
  onToggleListExpanded: () => void;
  listCount: number;
  /** 이 key를 가진 행으로 스크롤(추가 직후 새 항목 / 열릴 때 선택 항목). 값이 바뀔 때마다 재시도. */
  scrollToKey?: string | null;
  /** 타이틀 행 오른쪽 슬롯(선택) — 전체 삭제 휴지통 등. 항목이 없을 땐 호출부가 null로 숨긴다. */
  titleAccessory?: ReactNode;
  /** 목록 드래그 순서 변경(선택). order=재정렬 대상 key들의 표시 순서, onReorder=놓을 때 새 순서(id 배열).
   *  대상 행은 각 픽커가 PickerReorderRow로 감싼다. 커밋 계약(본 목록과 같은 순서 API·낙관 반영)은 호출부 몫.
   *  onActivate=꾹 눌렀다 이동 없이 뗀 "승격 탭"의 행 동작(선택/수정) — 자식 DOM Pressable을 우회한
   *  직접 발화라 드래그 가드와 충돌하지 않는다(빠른 탭은 자식 Pressable이 그대로 처리). */
  reorder?: {
    order: string[];
    onReorder: (ids: string[]) => void;
    onActivate?: (id: string) => void;
    /** 행 더블탭(웹 더블클릭) — 스와이프 [수정]과 같은 상세 수정 모달을 연다. 본 목록(use-reorder.tsx
     *  onEditRequest)과 같은 문법. 없으면 더블탭 무동작(전체 삭제 휴지통 등 수정 폼이 없는 경우). */
    onEditRequest?: (id: string) => void;
  } | null;
  /** 행 리스트(각 픽커가 PickerRow로 렌더). */
  children: ReactNode;
}

export function PickerModal({
  visible,
  title,
  onClose,
  newName,
  onChangeNewName,
  onAdd,
  addPlaceholder,
  adding,
  addLabel,
  cancelLabel,
  saveLabel,
  onSave,
  saving,
  closeOnly = false,
  newDescription,
  onChangeNewDescription,
  descriptionPlaceholder,
  addExtra,
  addExpanded,
  onToggleAddExpanded,
  listExpanded,
  onToggleListExpanded,
  listCount,
  scrollToKey = null,
  titleAccessory,
  reorder = null,
  children,
}: PickerModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reducedMotion = useReducedMotion();
  // 열릴 때 스크린리더 포커스를 타이틀로 이동(ModalCard와 같은 공용 훅).
  const titleRef = useModalA11yFocus(visible);

  // ── 목록 드래그 순서 변경 배선 ──────────────────────────────────────────
  // 본 목록(분류·태그)의 가변 높이 재정렬 엔진(useVarReorder)을 픽커 ScrollView 안에서 재사용한다.
  // 순서/커밋은 reorder prop이 최신을 들고, 행 실측 높이는 onLayout으로 모아 hop 계산에 쓴다.
  const reorderRef = useRef(reorder);
  reorderRef.current = reorder;
  const reorderOrderRef = useRef<string[]>(reorder?.order ?? []);
  reorderOrderRef.current = reorder?.order ?? [];
  const rowHeights = useRef<Map<string, number>>(new Map());
  const reorderControls = useVarReorder<string>({
    getOrder: () => reorderOrderRef.current,
    getId: (id) => id,
    getHeight: (id) => rowHeights.current.get(id) ?? PICKER_TILE_SIZE + 12,
    onCommit: (nextIds) => reorderRef.current?.onReorder(nextIds),
    // 꾹 눌렀다 이동 없이 뗌 → 행 탭(선택/수정) 승격. 픽커 행 탭은 자식 DOM Pressable이 처리하므로
    // composeRowGesture Tap을 만들지 않는(onActivate 미전달) 대신 이 onPromote로만 승격 발화한다.
    onPromote: (id) => reorderRef.current?.onActivate?.(id),
    // 행 더블탭(웹 더블클릭) = 수정 모달 — activate(싱글탭)는 안 넘기므로 buildTapGesture가 doubleTap만
    // 만든다(Exclusive 대기 없음 → 자식 DOM Pressable의 빠른 싱글탭이 그대로 즉시 동작).
    onEditRequest: (id) => reorderRef.current?.onEditRequest?.(id),
  });
  const registerHeight = useCallback((key: string, h: number) => {
    if (h > 0) rowHeights.current.set(key, h);
  }, []);
  const reorderCtx = useMemo<PickerReorderCtx | null>(
    () =>
      reorder
        ? { order: reorder.order, controls: reorderControls, registerHeight }
        : null,
    [reorder, reorderControls, registerHeight],
  );

  // ── 행 스와이프 액션 배선 ────────────────────────────────────────────────
  // 본 목록(분류·태그 탭)의 스와이프 조정(한 번에 한 행만 열림 · 드래그 직후 오탭 무시)을 픽커에서 재현한다.
  const swipeRefs = useRef<Map<string, SwipeableRowMethods | null>>(new Map());
  const openRowKey = useRef<string | null>(null);
  const swipeDragging = useRef(false);
  const swipeCtx = useMemo<PickerSwipeCtx>(
    () => ({
      register: (key, methods) => {
        if (methods) swipeRefs.current.set(key, methods);
        else swipeRefs.current.delete(key);
      },
      onOpenChange: (key, open) => {
        if (open) {
          const prev = openRowKey.current;
          if (prev && prev !== key) swipeRefs.current.get(prev)?.close();
          openRowKey.current = key;
        } else if (openRowKey.current === key) {
          openRowKey.current = null;
        }
      },
      setDragging: (dragging) => {
        swipeDragging.current = dragging;
      },
      isDragging: () => swipeDragging.current,
      isOpen: (key) => openRowKey.current === key,
      closeRow: (key) => swipeRefs.current.get(key)?.close(),
    }),
    [],
  );

  // 스크롤 레지스트리 — 행의 y offset을 key로 모으고, scrollToKey로 그 offset까지 스크롤한다.
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Map<string, number>>(new Map());
  const pendingKey = useRef<string | null>(null);

  const scrollToY = useCallback((y: number) => {
    // 항목 상단이 살짝 여백을 두고 보이도록 6px 위로.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 6), animated: !reducedMotion });
  }, [reducedMotion]);

  // 행이 레이아웃되면 offset 등록. 마침 그 key를 기다리고 있었으면 즉시 스크롤(추가 직후 케이스).
  const register = useCallback(
    (key: string, y: number) => {
      offsets.current.set(key, y);
      if (pendingKey.current === key) {
        pendingKey.current = null;
        requestAnimationFrame(() => scrollToY(y));
      }
    },
    [scrollToY],
  );
  const scrollCtx = useMemo<PickerScrollCtx>(() => ({ register }), [register]);

  // scrollToKey가 지정되면: 이미 offset을 알면 바로, 아니면 등록될 때까지 pending으로 대기.
  // null이면 대기 중인 스크롤을 취소한다(관리 모드처럼 선택이 없어 스크롤할 항목이 없을 때).
  useEffect(() => {
    if (!visible) return;
    if (!scrollToKey) {
      pendingKey.current = null;
      return;
    }
    const known = offsets.current.get(scrollToKey);
    if (known != null) {
      requestAnimationFrame(() => scrollToY(known));
    } else {
      pendingKey.current = scrollToKey;
    }
  }, [visible, scrollToKey, scrollToY]);

  // 닫히면 레지스트리 초기화(다음 열림 때 stale offset으로 잘못 스크롤하지 않게).
  useEffect(() => {
    if (visible) return;
    offsets.current.clear();
    pendingKey.current = null;
    // 다음 열림에서 stale한 열림/드래그 상태로 오작동하지 않게 스와이프 상태도 초기화.
    openRowKey.current = null;
    swipeDragging.current = false;
  }, [visible]);

  // Android 하드웨어 뒤로가기(다른 모달과 동일).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // 웹 Esc 닫기(role dialog 관례).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={styles.overlayRoot}>
      {/* 스크림 탭 = 닫기. 카드·컨트롤은 자기 터치를 소비해서 안 닫힌다. */}
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessible={false}
        focusable={false}
      />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
        accessibilityViewIsModal
      >
        <View style={styles.card}>
          <View style={styles.titleRow}>
            {/* ref+tabIndex=-1: 열릴 때 스크린리더 포커스를 여기로 이동(useModalA11yFocus). */}
            <View
              ref={titleRef}
              tabIndex={-1}
              accessible
              accessibilityRole="header"
              style={styles.titleText}
            >
              <Text variant="heading">{title}</Text>
            </View>
            {/* 타이틀 오른쪽 보조 슬롯(전체 삭제 휴지통 등) — 없으면 자리 차지 안 함. */}
            {titleAccessory ? (
              <View style={styles.titleAccessory}>{titleAccessory}</View>
            ) : null}
          </View>

          {/* 상단: 신규 항목 생성 폼 — "목록" 섹션과 같은 접이식 문법(헤더 탭 = 펼침/접힘).
              두 모드(관리/선택) 공용 세로 스택. 펼치면 이름 입력 → 설명(있으면) →
              addExtra 슬롯(있으면, 예: 태그 키워드 스테퍼) → 우측 정렬 검정(primary) [추가] 버튼
              (푸터 [저장]과 같은 문법). closeOnly는 아래 푸터(닫기/저장·취소) 구성에만 관여한다. */}
          <PickerSectionHeader
            expanded={addExpanded}
            onToggle={onToggleAddExpanded}
            label={t('common.add')}
          />
          {addExpanded ? (
            <>
              <TextInput
                style={styles.addNameInput}
                value={newName}
                onChangeText={onChangeNewName}
                placeholder={addPlaceholder}
                placeholderTextColor={colors.textTertiary}
                onSubmitEditing={onAdd}
                returnKeyType="done"
                editable={!adding}
                accessibilityLabel={t('a11y.nameInput')}
              />
              {onChangeNewDescription ? (
                <TextInput
                  style={styles.descriptionInput}
                  value={newDescription}
                  onChangeText={onChangeNewDescription}
                  placeholder={descriptionPlaceholder}
                  placeholderTextColor={colors.textTertiary}
                  onSubmitEditing={onAdd}
                  returnKeyType="done"
                  editable={!adding}
                  accessibilityLabel={t('a11y.descriptionInput')}
                />
              ) : null}
              {/* 추가 폼 전용 슬롯(태그 키워드 스테퍼 등). 안 넘긴 픽커(분류)는 표시 안 됨. */}
              {addExtra}
              <Button
                label={addLabel}
                variant="primary"
                onPress={onAdd}
                loading={adding}
                style={styles.addSubmitButton}
              />
            </>
          ) : null}

          {/* "목록" 섹션 헤더 — 스크롤 밖(고정). 목록이 길어 행들이 스크롤돼도 헤더는 항상 보인다
              (행들만 아래 ScrollView에서 스크롤). 개수·접기 동작은 그대로. */}
          <PickerSectionHeader
            expanded={listExpanded}
            onToggle={onToggleListExpanded}
            count={listCount}
          />

          {/* 목록이 길면 카드 안에서 스크롤. 행들은 scrollCtx로 자기 offset을 등록한다. */}
          <PickerScrollContext.Provider value={scrollCtx}>
            <PickerReorderContext.Provider value={reorderCtx}>
              <PickerSwipeContext.Provider value={swipeCtx}>
                <ScrollView
                  ref={scrollRef}
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  // 드래그 중엔 스크롤을 멈춰 손가락 이동이 재정렬에만 쓰이게 한다(본 목록과 동일).
                  scrollEnabled={reorderControls.draggingId === null}
                >
                  {children}
                </ScrollView>
              </PickerSwipeContext.Provider>
            </PickerReorderContext.Provider>
          </PickerScrollContext.Provider>

          {/* 픽커 공통 푸터: 우측 정렬 공용 Button.
              선택 픽커 = [취소(ghost)][저장(primary)]. 관리 모드(closeOnly) = [닫기(ghost)] 하나만
              — 검정 채움(primary)은 상태를 확정·변경하는 버튼에만, 닫기/취소는 항상 밑줄(ghost). */}
          <View style={styles.closeRow}>
            {closeOnly ? (
              <Button
                label={saveLabel}
                variant="ghost"
                onPress={onSave}
                style={styles.saveButton}
              />
            ) : (
              <>
                <Button
                  label={cancelLabel}
                  variant="ghost"
                  onPress={onClose}
                  disabled={saving}
                  style={styles.saveButton}
                />
                <Button
                  label={saveLabel}
                  variant="primary"
                  onPress={onSave}
                  loading={saving}
                  style={styles.saveButton}
                />
              </>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

interface PickerRowProps {
  /** 왼쪽 타일 — 분류=CategoryAvatar, 태그=HashTile. 둘 다 PICKER_TILE_SIZE. */
  tile: ReactNode;
  label: string;
  /** 이름 밑 회색 한 줄(선택) — 분류·태그의 설명. 목록 화면 행과 같은 문법. */
  description?: string | null;
  /** 선택(활성) — 배경을 surface로 채운다(앱의 "선택 active" 관례, 체크 아이콘 없음). */
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** 다중 선택(태그)=checkbox, 단일(분류)=radio — a11y 상태 표현만 다르다. */
  multi: boolean;
  /** 스크롤 타깃 등록용 key(추가 직후·선택 항목으로 스크롤). 보통 항목 id. 스와이프 열림/닫힘 판별에도 쓴다. */
  scrollKey?: string;
  /** 스크린리더 대안: 스와이프 액션의 접근성 커스텀 액션(PickerReorderRow가 cloneElement로 주입). */
  accessibilityActions?: SwipeActionsA11y['accessibilityActions'];
  onAccessibilityAction?: SwipeActionsA11y['onAccessibilityAction'];
}

// 두 픽커 공용 행: [타일][이름]. 선택 표시는 surface 채움뿐(체크 아이콘·ink 칩 없음).
// 눌림 피드백도 surface 채움(플랫 언어) — 선택된 행은 눌려도 그대로 채워져 있다.
export function PickerRow({
  tile,
  label,
  description,
  selected,
  disabled = false,
  onPress,
  multi,
  scrollKey,
  accessibilityActions,
  onAccessibilityAction,
}: PickerRowProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 스크롤 타깃 offset 등록은 바깥 래퍼(PickerReorderRow)가 담당한다 — 안쪽 Pressable의 y는
  // 자기 부모 기준이라 스크롤 콘텐츠 기준 offset과 어긋나기 때문(추가 직후·선택 항목 스크롤 정확도).
  // 드래그 세션 직후 따라오는 click을 눌러 무시(순서만 바꿨는데 선택이 새는 누수 방지).
  const dragGuarded = usePickerReorderGuard();
  // 스와이프 드래그 직후 오탭 무시 + 열린 행 탭 = 닫기(본 목록과 같은 규칙).
  const swipeGuarded = usePickerSwipeTapGuard(scrollKey);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        (selected || pressed) && styles.rowActive,
      ]}
      onPress={() => {
        if (dragGuarded()) return;
        if (swipeGuarded()) return;
        onPress();
      }}
      disabled={disabled}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={
        multi
          ? { checked: selected, disabled }
          : { selected, disabled }
      }
      accessibilityLabel={label}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
    >
      {tile}
      {/* 이름(+설명 한 줄) — 목록 화면(분류/태그 행)과 같은 문법으로 설명을 보여준다. */}
      <View style={styles.rowLabelCol}>
        <Text variant="body" style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textTertiary} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

interface PickerSectionHeaderProps {
  /** 펼침 상태 — 접히면 호출부가 아래 행들을 숨긴다(헤더 자체는 항상 보임). */
  expanded: boolean;
  onToggle: () => void;
  /** 이 섹션 행 수(전체 행 제외) — 넘기면 라벨 옆에 표시. 넘기지 않으면(예: 추가 폼 섹션엔
   *  개수 개념이 없다) 표시하지 않는다. 0이어도 헤더는 그대로 보이고, 접기는 무해하다. */
  count?: number;
  /** 헤더 라벨 — 기본은 '목록'(common.listSection). 추가 폼 섹션은 common.add('추가')를 넘긴다. */
  label?: string;
}

// 픽커 카드 안 접이식 섹션 헤더 — 본 목록(FriendsScreen·TagsScreen·AutoScreen)의 접이식 섹션
// 헤더와 같은 시각 문법·동작([∨/›] + 라벨(+개수), 탭하면 접힘/펼침)을 재현한다. "목록" 섹션(count
// 있음)과 "추가" 폼 섹션(count 없음, PickerModal이 직접 렌더)이 이 구현 한 벌을 공유한다.
// 카드가 이미 좌우 20px 인셋을 주므로 본 목록과 달리 paddingHorizontal은 두지 않는다(행들과 flush).
export function PickerSectionHeader({ expanded, onToggle, count, label }: PickerSectionHeaderProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const text = label ?? t('common.listSection');
  return (
    <TouchableOpacity
      style={styles.sectionRow}
      onPress={onToggle}
      activeOpacity={0.6}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={text}
    >
      {expanded ? (
        <ChevronDown size={16} strokeWidth={2} color={colors.textSecondary} />
      ) : (
        <ChevronRight size={16} strokeWidth={2} color={colors.textSecondary} />
      )}
      <Text variant="caption" color={colors.textSecondary} style={styles.sectionTitle}>
        {text}
      </Text>
      {count != null ? (
        <Text variant="micro" color={colors.textSecondary}>{count}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlayRoot: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    scrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    kav: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 16,
    },
    // 타이틀 + 오른쪽 보조 슬롯(전체 삭제 휴지통 등)을 한 줄에 양끝 정렬.
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    titleText: {
      flexShrink: 1,
    },
    titleAccessory: {
      marginLeft: 8,
    },
    // 추가 폼 이름 입력 — 전폭(세로 스택의 첫 줄). marginTop = 추가 섹션 헤더와의 간격
    // ('목록' 섹션 헤더의 paddingBottom(4) + 첫 행 paddingTop(6)과 같은 시각 간격을 재현).
    addNameInput: {
      marginTop: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    // 추가 폼 맨 아래 검정(primary) [추가] 버튼 — 푸터 [저장]과 같은 문법(우측 정렬, 최소 폭).
    addSubmitButton: {
      marginTop: 10,
      alignSelf: 'flex-end',
      height: 42,
      minWidth: 92,
    },
    // 추가 폼 '설명 (선택)' — 이름 입력과 같은 박스, 아래로 한 칸.
    descriptionInput: {
      marginTop: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    // 위 "목록" 섹션 헤더(paddingBottom 4)가 행들과의 간격을 이미 주므로 여기선 marginTop 없음.
    scroll: {
      flexShrink: 1,
    },
    scrollContent: {
      paddingBottom: 4,
    },
    // 우측 정렬 [취소][저장] — ModalCard의 액션 줄 문법과 통일.
    closeRow: {
      marginTop: 14,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
    },
    saveButton: {
      height: 46,
      minWidth: 92,
    },
    // '목록' 섹션 헤더 — 본 목록 sectionRow와 같은 간격(paddingTop 16·paddingBottom 4·gap 10),
    // 좌우는 카드 인셋을 그대로 쓰므로 paddingHorizontal 없음(행들과 flush).
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 4,
      gap: 10,
    },
    sectionTitle: {
      flex: 1,
    },
    // 각 행: [타일][이름], 타일 높이 기준 최소 높이.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: PICKER_TILE_SIZE + 12,
      paddingVertical: 6,
      paddingHorizontal: 6,
      marginHorizontal: -6,
    },
    // 선택·눌림 = surface 채움(앱의 "선택 active" 관례). 그림자·보더 없음.
    rowActive: {
      backgroundColor: colors.surface,
    },
    // 이름(+설명) 세로 컬럼 — 타일 오른쪽을 채운다.
    rowLabelCol: {
      flex: 1,
      marginLeft: 12,
      paddingRight: 8,
    },
    rowLabel: {},
  });
