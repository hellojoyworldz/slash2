import { ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react-native';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { arrow, flip, offset, shift, useFloating } from '@floating-ui/react-native';
import { usePopoverHost } from '../popover';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Text } from './Text';

// ⓘ 앵커 + 말풍선 팝오버 — 현재는 태그 키워드 스테퍼(KeywordStepper)가 쓰는 안내 토글.
// (탭/픽커 타이틀의 ⓘ는 타이틀 아래 상시 노출 서브타이틀로 대체되어 제거됨 — 이 컴포넌트는 유지.)
// 위치 계산은 @floating-ui/react-native가 담당: 기본 오른쪽 배치, 공간 없으면 flip 폴백,
// shift로 화면 안으로 밀어넣기, arrow로 꼬리를 ⓘ에 맞춘다. 조상 overflow 클리핑을 피하려고
// 말풍선은 루트 오버레이(PopoverHost)로 포탈해 화면 좌표 절대배치로 렌더한다.
// 탭 토글 · 말풍선 탭으로 닫힘. DESIGN 재질(라운드 0·2px ink 보더·하드 섀도). a11y: expanded + 라벨.

const TAIL = 12;
const PROTRUDE = TAIL / 2;
const BUBBLE_WIDTH = 240;

interface Props {
  /** 안내 문구(텍스트). children이 있으면 그걸 우선 렌더. */
  text?: string;
  /** 커스텀 말풍선 내용(선택) — 없으면 text를 micro 텍스트로 렌더. */
  children?: ReactNode;
  /** ⓘ 버튼 a11y 라벨(필수 — 아이콘 전용 버튼). */
  label: string;
  /** 아이콘 크기(기본 15). */
  iconSize?: number;
  /** 아이콘 색(기본 textTertiary). */
  iconColor?: string;
}

export function InfoPopover({ text, children, label, iconSize = 15, iconColor }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const host = usePopoverHost();
  const id = useId();
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<View>(null);

  const { refs, floatingStyles, placement, middlewareData } = useFloating({
    placement: 'right',
    // 앵커(모달/패널 안)와 말풍선(루트 오버레이)이 다른 스크롤뷰라 false.
    sameScrollView: false,
    middleware: [
      offset(8),
      flip({ fallbackPlacements: ['left', 'bottom', 'top'], padding: 8 }),
      shift({ padding: 8, crossAxis: true }),
      arrow({ element: arrowRef }),
    ],
  });

  // offsetParent = 루트 오버레이(클리핑 없는 화면 좌표 기준).
  useEffect(() => {
    refs.setOffsetParent(host.offsetParent);
  }, [refs, host.offsetParent]);

  const side = placement.split('-')[0] as 'top' | 'bottom' | 'left' | 'right';
  const arrowX = middlewareData.arrow?.x;
  const arrowY = middlewareData.arrow?.y;
  // arrow 데이터가 잡혔으면 위치 계산 완료 — 그 전엔 말풍선을 숨겨 (0,0) 깜빡임을 막는다.
  const positioned = arrowX != null || arrowY != null;

  const top = floatingStyles.top;
  const left = floatingStyles.left;

  // 열림 상태에 따라 루트 오버레이에 말풍선을 포탈한다(위치가 바뀌면 갱신 재-마운트).
  useEffect(() => {
    if (!open || !host.offsetParent) {
      host.unmount(id);
      return;
    }
    const bubble = (
      <View
        ref={refs.setFloating}
        style={[styles.bubble, { top, left, opacity: positioned ? 1 : 0 }]}
        accessibilityLiveRegion="polite"
      >
        <View
          ref={arrowRef}
          style={[styles.tail, tailStyle(side, arrowX, arrowY)]}
          pointerEvents="none"
        />
        <Pressable
          onPress={() => setOpen(false)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {children ?? (
            <Text
              variant="micro"
              color={colors.textSecondary}
              style={styles.bubbleText}
            >
              {text}
            </Text>
          )}
        </Pressable>
      </View>
    );
    host.mount(id, bubble);
    return () => host.unmount(id);
    // 위치·내용 원시값만 의존(객체 identity 변화로 무한 재-마운트 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, host.offsetParent, id, top, left, positioned, side, arrowX, arrowY, text, label, children, colors, styles]);

  // 언마운트 시 오버레이 정리.
  useEffect(() => () => host.unmount(id), [host, id]);

  return (
    <View ref={refs.setReference} collapsable={false} style={styles.anchor}>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={label}
      >
        <Info size={iconSize} strokeWidth={2} color={iconColor ?? colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

// 꼬리(45° 회전 사각형) 배치·방향 — placement side에 따라 ⓘ를 가리키게 보이는 두 변을 켠다.
function tailStyle(
  side: 'top' | 'bottom' | 'left' | 'right',
  arrowX?: number,
  arrowY?: number,
): StyleProp<ViewStyle> {
  switch (side) {
    case 'right': // 말풍선이 ⓘ 오른쪽 → 꼬리는 왼쪽 변에서 왼쪽을 가리킴.
      return {
        left: -PROTRUDE,
        top: arrowY ?? 0,
        borderLeftWidth: 2,
        borderBottomWidth: 2,
      };
    case 'left':
      return {
        right: -PROTRUDE,
        top: arrowY ?? 0,
        borderTopWidth: 2,
        borderRightWidth: 2,
      };
    case 'top':
      return {
        bottom: -PROTRUDE,
        left: arrowX ?? 0,
        borderBottomWidth: 2,
        borderRightWidth: 2,
      };
    case 'bottom':
    default:
      return {
        top: -PROTRUDE,
        left: arrowX ?? 0,
        borderTopWidth: 2,
        borderLeftWidth: 2,
      };
  }
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    anchor: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    // 말풍선 본체 — DESIGN 재질(라운드 0·2px ink 보더·하드 오프셋 섀도). top/left는 floating-ui가 준다.
    bubble: {
      position: 'absolute',
      width: BUBBLE_WIDTH,
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: colors.ink,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      // 하드 섀도(블러 0). Android elevation은 소프트 섀도라 DESIGN에 어긋나 쓰지 않는다.
      shadowColor: colors.ink,
      shadowOffset: { width: 3, height: 3 },
      shadowOpacity: 1,
      shadowRadius: 0,
    },
    bubbleText: {
      lineHeight: 18,
    },
    // 꼬리 — 회전 사각형. 방향별 보이는 두 변은 tailStyle에서 border로 켠다.
    tail: {
      position: 'absolute',
      width: TAIL,
      height: TAIL,
      backgroundColor: colors.background,
      borderColor: colors.ink,
      transform: [{ rotate: '45deg' }],
    },
  });
