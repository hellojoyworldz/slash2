import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { hexToHsl, hslToHex, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { CategoryAvatar } from './CategoryAvatar';
import { Text } from './Text';

// 자유 색 선택기: 색조(hue) 레일 + 명도(lightness) 레일을 끌거나(드래그) 탭해서 고른다.
// 채도는 65로 고정 — 프리셋과 결이 맞고 흐리멍덩하지 않게. 명도는 30~88로 클램프해
// 라이트/다크 어디서도 저대비(너무 밝거나 어두운 배경)를 예방한다.
// 레일은 "장식 그라디언트"가 아니라 기능적 색 견본의 나열 — 세그먼트 View를 이어 그린다
// (DESIGN의 그라디언트 금지 예외: 값을 고르는 계기판이라서).
const SAT = 65;
const L_MIN = 30;
const L_MAX = 88;
const HUE_SEGMENTS = 24;
const LIGHT_SEGMENTS = 24;
const RAIL_HEIGHT = 26;
const KNOB_W = 14;
const PREVIEW = 44;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface Props {
  /** 현재 색(hex). hue·lightness를 여기서 되짚어 인디케이터 위치를 잡는다. */
  value: string;
  /** 레일을 끌 때마다 새 hex(hslToHex(h,65,l))를 돌려준다. */
  onChange: (hex: string) => void;
  hueLabel: string;
  lightnessLabel: string;
  /** 미리보기 옆에 붙일 액세서리 (예: "프로필 추가" 버튼) */
  previewAccessory?: ReactNode;
}

export function ColorPicker({
  value,
  onChange,
  hueLabel,
  lightnessLabel,
  previewAccessory,
}: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // ── h(0–360)·l(30~88) 숫자 자체가 source of truth ──────────────────
  // hex는 여기서 hslToHex(h, 고정 s, l)로 한 방향으로만 파생한다.
  // hex→HSL 역산은 "초기 1회 + 외부에서 색이 바뀔 때(프리셋·저장 스와치 탭·재프리필)"만.
  // (매 렌더 hex를 역산하면 hslToHex의 8비트 RGB 양자화 때문에 왕복마다 h가 ±1~2도 드리프트해
  //  명도만 문질러도 색조가 흔들렸다. 이제 명도 레일은 l만, 색조 레일은 h만 건드린다.)
  const [hue, setHue] = useState(() => clamp(hexToHsl(value)[0], 0, 360));
  const [light, setLight] = useState(() =>
    clamp(hexToHsl(value)[2], L_MIN, L_MAX),
  );
  // 방금 우리가 내보낸 hex를 기억 — 그게 prop으로 되돌아올 땐(자기 에코) 재역산하지 않는다.
  const lastEmitted = useRef(value);

  useEffect(() => {
    // 외부발 변경일 때만 h/l 재동기화(우리 에코면 무시 → 조작 중 드리프트 0).
    if (value.toUpperCase() === lastEmitted.current.toUpperCase()) return;
    lastEmitted.current = value;
    setHue(clamp(hexToHsl(value)[0], 0, 360));
    setLight(clamp(hexToHsl(value)[2], L_MIN, L_MAX));
  }, [value]);

  // h/l → hex 한 방향 파생. 내보낸 값을 lastEmitted에 기록해 위 useEffect가 되튕기지 않게 한다.
  const emit = useCallback(
    (h: number, l: number) => {
      const hex = hslToHex(h, SAT, l);
      lastEmitted.current = hex;
      onChange(hex);
    },
    [onChange],
  );

  // hue 레일: 현재 명도로 각 색조를 미리 보여준다(고른 명도에서 어떤 색이 될지).
  const hueSegments = useMemo(
    () =>
      Array.from({ length: HUE_SEGMENTS }, (_, i) =>
        hslToHex((i / (HUE_SEGMENTS - 1)) * 360, SAT, light),
      ),
    [light],
  );
  // lightness 레일: 현재 색조를 명도 대역(30~88)에 걸쳐 보여준다.
  const lightSegments = useMemo(
    () =>
      Array.from({ length: LIGHT_SEGMENTS }, (_, i) =>
        hslToHex(hue, SAT, L_MIN + (i / (LIGHT_SEGMENTS - 1)) * (L_MAX - L_MIN)),
      ),
    [hue],
  );

  // 색조 레일은 h만, 명도 레일은 l만 갱신 — 서로 간섭하지 않는다.
  const onHue = useCallback(
    (t: number) => {
      const h = t * 360;
      setHue(h);
      emit(h, light);
    },
    [emit, light],
  );
  const onLight = useCallback(
    (t: number) => {
      const l = L_MIN + t * (L_MAX - L_MIN);
      setLight(l);
      emit(hue, l);
    },
    [emit, hue],
  );

  return (
    <View style={styles.wrap}>
      <Rail
        label={hueLabel}
        segments={hueSegments}
        position={hue / 360}
        onScrub={onHue}
      />
      <Rail
        label={lightnessLabel}
        segments={lightSegments}
        position={(light - L_MIN) / (L_MAX - L_MIN)}
        onScrub={onLight}
      />
      {/* 라이브 미리보기 — 고른 색이 그대로 어떤 프로필 아바타가 될지 (+ 옆에 액세서리) */}
      <View style={styles.previewRow}>
        <CategoryAvatar color={value} size={PREVIEW} />
        {previewAccessory}
      </View>
    </View>
  );
}

interface RailProps {
  label: string;
  segments: string[];
  /** 인디케이터 위치 0~1 */
  position: number;
  /** 스크럽 결과 0~1 */
  onScrub: (t: number) => void;
}

function Rail({ label, segments, position, onScrub }: RailProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [railW, setRailW] = useState(0);
  const widthRef = useRef(0);
  // onScrub은 매 렌더 새 클로저 — 제스처가 최신 값을 부르도록 ref로 우회.
  const scrubRef = useRef(onScrub);
  scrubRef.current = onScrub;

  const scrub = useCallback((x: number) => {
    const w = widthRef.current;
    if (w > 0) scrubRef.current(clamp(x / w, 0, 1));
  }, []);

  // 탭=점프, 가로 드래그=스크럽. 세로 움직임엔 양보(오버레이 스크롤과 공존).
  // 제스처는 한 번만 만든다(리렌더로 재부착돼 드래그가 끊기지 않게).
  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(16)
      .onEnd((e) => scrub(e.x));
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .failOffsetY([-14, 14])
      .onStart((e) => scrub(e.x))
      .onUpdate((e) => scrub(e.x));
    return Gesture.Race(pan, tap);
  }, [scrub]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setRailW(w);
  };

  // 인디케이터는 트랙 안에 머물게 중심을 클램프.
  const knobLeft =
    railW > 0 ? clamp(position * railW, KNOB_W / 2, railW - KNOB_W / 2) : 0;

  return (
    <View style={styles.railBlock}>
      <Text variant="caption" color={colors.textSecondary} style={styles.railLabel}>
        {label}
      </Text>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.railHit}
          onLayout={onLayout}
          accessible={false}
        >
          <View style={styles.rail}>
            {segments.map((c, i) => (
              <View key={i} style={[styles.segment, { backgroundColor: c }]} />
            ))}
          </View>
          {/* ink 링 스크럽 손잡이(계기판 눈금) — 트랙 위로 살짝 넘겨 어떤 색 위에서도 보이게 */}
          <View
            pointerEvents="none"
            style={[styles.knob, { left: knobLeft - KNOB_W / 2 }]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    wrap: {
      marginTop: 12,
    },
    railBlock: {
      marginBottom: 14,
    },
    railLabel: {
      marginBottom: 6,
    },
    // 손잡이 오버행 여유 + 44pt 터치 타깃 확보
    railHit: {
      paddingVertical: 10,
      justifyContent: 'center',
    },
    rail: {
      flexDirection: 'row',
      height: RAIL_HEIGHT,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
    },
    // ink 1px 링 손잡이(선택 표시는 ink — DESIGN). 라운드 0, 플랫.
    knob: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      width: KNOB_W,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.ink,
      backgroundColor: colors.background,
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      marginTop: 2,
      marginBottom: 2,
    },
  });
