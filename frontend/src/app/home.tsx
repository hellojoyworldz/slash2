// 마케팅 랜딩페이지 (/home) — 브랜드 서피스.
//
// 이 화면은 의도적으로 앱의 DESIGN.md(라운드 0·소프트 섀도 금지)를 완전히 따르지 않고
// 라운드·소프트 섀도를 허용한다(스토어 간판). 다만 색 철학만은 앱과 일치시킨다:
// 브랜드는 순수 흑백이고 "색은 분류의 것"이다. 그래서 드렌치 서피스는 블랙(#111)으로 두고,
// 원색(파스텔)은 오직 분류에 대응하는 요소 — 데모 말풍선·칩, 기능 스티커 블롭,
// 보기방식 미니 패널, 대비 스트립 슬래시 셀, 키워드 데모 태그 — 에만 쓴다. 크롬엔 색이 없다.
// 색은 useTheme()가 아니라 아래 로컬 상수를 쓰고, 다크모드와 무관하게 항상 같은 룩으로 렌더한다.
//
// 접근성 대비: 블랙 서피스 위 흰 텍스트는 ~18:1로 자동 확보. 흰 배경 본문은
//   #1F2230 제목 ≈13:1, #4A4E5A 설명 ≈9:1, #6E7280 모노 ≈4.6:1로 4.5 이상 유지.
//
// ── 모션 (apple-design SKILL의 RN/Reanimated 번역) ──
// · transform/opacity만 애니메이트. 값은 전부 Reanimated shared value → JS 리렌더 없음(60fps).
// · 기본 스프링은 크리티컬 댐핑(dampingRatio 1, 오버슛 없음). 채팅 말풍선 팝처럼 모멘텀이
//   있는 등장에만 아주 약한 바운스(dampingRatio ~0.72). withSpring의 {duration, dampingRatio}가
//   애플의 response/damping과 직접 대응한다.
// · reduce-motion이면 전부 최종 상태로 정적 렌더(루프·리빌 없음). 리빌은 opacity 0.35→1로
//   "이미 보이는 기본값의 강화" — JS 실패/리듀스드에서도 콘텐츠가 사라지지 않는다.
// · 스크롤 리빌은 웹에 IntersectionObserver가 없어 ScrollView onScroll + 섹션 onLayout y로 계측.
//   섹션 진입 시 1회만 setState(프레임마다 아님).

import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text as RNText,
  TextProps,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth';
import { isElectron } from '../auth-routes';
import {
  LANGUAGE_NAMES,
  Language,
  setLanguage,
  SUPPORTED_LANGUAGES,
} from '../i18n';

// ── 팔레트 (흑백 브랜드 · 다크모드 무관 고정) ──
const SURFACE_DARK = '#111111'; // 드렌치 → 블랙 서피스 (히어로·마지막 CTA), 흰 텍스트 ~18:1
const WHITE = '#FFFFFF';
const ON_DARK_SUB = '#E6E7EC'; // 어두운 면 위 서브 본문 (중립 근백)
const ON_DARK_MUTED = '#B9BBC4'; // 어두운 면 위 힌트/비활성 (중립 회색, #111 대비 ~8:1)
const PAGE = '#FFFFFF';
const TINT = '#F5F5F7'; // 섹션 구분용 중립 라이트 그레이
const INK = '#1F2230'; // 본문 제목 (흰 배경)
const INK_STRONG = '#111111'; // CTA 라벨·리더라인 value (앱 ink 톤)
const INK_SOFT = '#4A4E5A'; // 본문 설명 (흰 배경, 9:1)
const DIM = '#5C616E'; // 대비 스트립 '문제' 텍스트 (틴트 위 ~5.4:1, 의도적 dim)
const MONO_MUTED = '#6E7280'; // 모노 메타 라벨 (흰 배경, ~4.6)
const HAIRLINE = '#E7E8EC';
const DOTS = '#CBCBD0';

// 파스텔 (CATEGORY_COLORS)
const PINK = '#EBADC4';
const YELLOW = '#EEDB96';
const SKY = '#ABD9ED';

// 말풍선 (probe-d 그대로 — 자체 대비 충분)
const BUBBLE = {
  pink: { bg: '#FBE9F0', bd: PINK, tx: '#5A3A47' },
  yellow: { bg: '#FDF6DE', bd: YELLOW, tx: '#5C5233' },
  sky: { bg: '#E8F4FB', bd: SKY, tx: '#2F4A58' },
};

const MONO = 'AzeretMono_500Medium';
const SYMBOL_RATIO = 310 / 300;

const symbolWhite = require('../../assets/symbol-white.png');
const symbolBlack = require('../../assets/symbol.png');
const charLine = require('../../assets/charactor-transparent.png');

const DESKTOP = 900;
const CONTENT_MAX = 1120;
const PEEK_W = 108; // 히어로 마스코트 너비 (가로 중앙 정렬 계산에 사용)

// ── 모션 상수 ──
const SPRING_CRIT = { duration: 440, dampingRatio: 1 }; // 크리티컬 댐핑 (오버슛 없음)
const SPRING_POP = { duration: 380, dampingRatio: 0.72 }; // 채팅 팝 (아주 약한 바운스)
const EASE_OUT = Easing.out(Easing.cubic);
// 데모 패널 루프 타임라인(ms): 등장(1.1s~4.0s) → 유지(~2.6s) → 리셋(6.6s) → 갭 → 9.0s 반복.
const DEMO_L = 9000;
const DEMO_R = 6600;
const DEMO_APPEAR = 380;
const DEMO_FADE = 450;

const clampNum = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
// 유동 크기 (수동 clamp): minW~maxW 사이에서 minPx~maxPx로 보간.
const fluid = (w: number, minPx: number, maxPx: number, minW = 360, maxW = 1200) =>
  Math.round(minPx + (maxPx - minPx) * clampNum((w - minW) / (maxW - minW), 0, 1));

// 브랜드 서피스 전용 텍스트 — 앱 공용 Text(테마색 의존)를 쓰지 않고 색을 명시한다.
function T({ style, ...rest }: TextProps) {
  return <RNText style={style} {...rest} />;
}

export default function HomeRoute() {
  const { token, emailVerified } = useAuth();

  // 랜딩은 브라우저 웹 전용 간판. 네이티브·데스크톱(Electron) 접근은 로그인으로.
  if (Platform.OS !== 'web' || isElectron) return <Redirect href="/login" />;
  // 웹에서 이미 로그인했으면 랜딩을 못 보게 앱으로 (미인증이면 인증 안내로).
  if (token) return <Redirect href={emailVerified ? '/friends' : '/verify'} />;

  return <Landing />;
}

function Landing() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { width, height: viewportH } = useWindowDimensions();
  const wide = width >= DESKTOP;
  const reduced = useReducedMotion();

  const goLogin = () => router.push('/login');

  const h1 = fluid(width, 30, 56);
  const sub = fluid(width, 16, 19);
  const sectionTitle = fluid(width, 24, 34);

  // ── 스크롤 리빌 계측 (프레임마다 setState 금지: 섹션 진입 시 1회만) ──
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const revealedRef = useRef<Record<string, boolean>>({});
  const ysRef = useRef<Record<string, number>>({});
  const scrollYRef = useRef(0);

  const maybeReveal = (y: number) => {
    const trigger = y + viewportH * 0.85;
    let changed = false;
    const cur = revealedRef.current;
    for (const key in ysRef.current) {
      if (!cur[key] && trigger >= ysRef.current[key]) {
        cur[key] = true;
        changed = true;
      }
    }
    if (changed) setRevealed({ ...cur });
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollYRef.current = y;
    maybeReveal(y);
  };
  const registerY = (key: string) => (e: LayoutChangeEvent) => {
    ysRef.current[key] = e.nativeEvent.layout.y;
    maybeReveal(scrollYRef.current);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.rootContent}
      showsVerticalScrollIndicator={Platform.OS === 'web'}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      {/* ── 히어로 (블랙 브랜드 서피스, 마운트 오케스트레이션 등장) ── */}
      <View style={styles.heroSurface}>
        <View style={styles.contentWrap}>
          {/* NAV */}
          <View style={styles.nav}>
            <View style={styles.logo}>
              <Image
                source={symbolWhite}
                resizeMode="contain"
                accessible={false}
                style={styles.logoImg}
              />
              <T style={styles.logoText}>{t('home.brand')}</T>
            </View>
            <View style={styles.navRight}>
              <LangSelect current={i18n.language as Language} />
              <Pressable
                onPress={goLogin}
                accessibilityRole="button"
                accessibilityLabel={t('home.nav.login')}
                style={({ pressed }) => [
                  styles.loginPill,
                  pressed && styles.pressed,
                ]}
              >
                <T style={styles.loginPillText}>{t('home.nav.login')}</T>
              </Pressable>
            </View>
          </View>

          {/* HERO BODY */}
          <View style={[styles.hero, wide && styles.heroWide]}>
            <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
              <Entrance reduced={reduced} delay={0} dy={24}>
                <T
                  style={[
                    styles.h1,
                    { fontSize: h1, lineHeight: Math.round(h1 * 1.12) },
                  ]}
                  accessibilityRole="header"
                >
                  {t('home.hero.title')}
                </T>
              </Entrance>
              <Entrance reduced={reduced} delay={100} dy={16}>
                <T
                  style={[
                    styles.heroSub,
                    { fontSize: sub, lineHeight: Math.round(sub * 1.6) },
                  ]}
                >
                  {t('home.hero.sub')}
                </T>
              </Entrance>
              <Entrance
                reduced={reduced}
                delay={180}
                dy={16}
                style={[styles.ctaRow, wide && styles.ctaRowWide]}
              >
                <Pressable
                  onPress={goLogin}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.hero.cta')}
                  style={({ pressed }) => [
                    styles.ctaPill,
                    pressed && styles.ctaPillPressed,
                  ]}
                >
                  <T style={styles.ctaPillText}>{t('home.hero.cta')}</T>
                </Pressable>
              </Entrance>
            </View>

            {/* 제품 데모 패널 (뒤에서 마스코트 빼꼼) */}
            <View style={[styles.demoWrap, wide && styles.demoWrapWide]}>
              <Mascot reduced={reduced} />
              <Entrance
                reduced={reduced}
                delay={280}
                dscale={0.96}
                spring
                style={styles.demoPanelEntrance}
              >
                <DemoPanel reduced={reduced} />
              </Entrance>
            </View>
          </View>
        </View>
      </View>

      {/* ── [신규] 대비 스트립 ── */}
      <View
        style={[styles.section, styles.sectionWhite]}
        onLayout={registerY('contrast')}
      >
        <View style={styles.contentWrap}>
          <Reveal visible={!!revealed.contrast} reduced={reduced}>
            <T
              style={[styles.sectionH, styles.contrastHeading, { fontSize: sectionTitle }]}
              accessibilityRole="header"
            >
              {t('home.contrast.heading')}
            </T>
            <ContrastStrip wide={wide} />
          </Reveal>
        </View>
      </View>

      {/* ── 기능 3가지 (흰 배경, 스티커 감성 + 아이들 플로트) ── */}
      <View
        style={[styles.section, styles.sectionTint]}
        onLayout={registerY('features')}
      >
        <View style={styles.contentWrap}>
          <View style={[styles.features, wide && styles.featuresWide]}>
            <Feature
              color={PINK}
              rotate={-8}
              index={0}
              visible={!!revealed.features}
              reduced={reduced}
              title={t('home.features.paste.title')}
              desc={t('home.features.paste.desc')}
              titleSize={fluid(width, 19, 22)}
            />
            <Feature
              color={YELLOW}
              rotate={7}
              index={1}
              visible={!!revealed.features}
              reduced={reduced}
              title={t('home.features.classify.title')}
              desc={t('home.features.classify.desc')}
              titleSize={fluid(width, 19, 22)}
            />
            <Feature
              color={SKY}
              rotate={-6}
              index={2}
              visible={!!revealed.features}
              reduced={reduced}
              title={t('home.features.auto.title')}
              desc={t('home.features.auto.desc')}
              titleSize={fluid(width, 19, 22)}
            />
          </View>

          {/* 점선 리더라인 (probe-c) */}
          <Reveal visible={!!revealed.features} reduced={reduced} delay={220} style={styles.leader}>
            <LeaderLine
              label={t('home.leader.preview.label')}
              value={t('home.leader.preview.value')}
            />
            <LeaderLine
              label={t('home.leader.tag.label')}
              value={t('home.leader.tag.value')}
            />
            <LeaderLine
              label={t('home.leader.types.label')}
              value={t('home.leader.types.value')}
            />
          </Reveal>
        </View>
      </View>

      {/* ── [신규] 키워드 자동 태그 스포트라이트 ── */}
      <View
        style={[styles.section, styles.sectionWhite]}
        onLayout={registerY('keyword')}
      >
        <View style={styles.contentWrap}>
          <Reveal visible={!!revealed.keyword} reduced={reduced}>
            <View style={[styles.keywordWrap, wide && styles.keywordWrapWide]}>
              <View style={[styles.keywordCopy, wide && styles.keywordCopyWide]}>
                <T style={[styles.sectionH, { fontSize: sectionTitle }]} accessibilityRole="header">
                  {t('home.keyword.title')}
                </T>
                <T style={styles.sectionSub}>{t('home.keyword.desc')}</T>
              </View>
              <View style={[styles.keywordDemoWrap, wide && styles.keywordDemoWrapWide]}>
                <KeywordDemo visible={!!revealed.keyword} reduced={reduced} />
              </View>
            </View>
          </Reveal>
        </View>
      </View>

      {/* ── 보기 방식 ── */}
      <View
        style={[styles.section, styles.sectionTint]}
        onLayout={registerY('views')}
      >
        <View style={styles.contentWrap}>
          <Reveal visible={!!revealed.views} reduced={reduced}>
            <T style={[styles.sectionH, { fontSize: sectionTitle }]} accessibilityRole="header">
              {t('home.views.title')}
            </T>
            <T style={styles.sectionSub}>{t('home.views.desc')}</T>
            <View style={[styles.viewPanels, wide && styles.viewPanelsWide]}>
              <ChatMini caption={t('home.views.chat')} />
              <ListMini caption={t('home.views.list')} />
            </View>
          </Reveal>
        </View>
      </View>

      {/* ── 어디서나 ── */}
      <View
        style={[styles.section, styles.sectionWhite]}
        onLayout={registerY('everywhere')}
      >
        <View style={[styles.contentWrap, styles.centerBlock]}>
          <Reveal visible={!!revealed.everywhere} reduced={reduced} style={styles.centerBlock}>
            <T style={[styles.sectionH, styles.centerText, { fontSize: sectionTitle }]} accessibilityRole="header">
              {t('home.everywhere.title')}
            </T>
            <T style={[styles.sectionSub, styles.centerText]}>
              {t('home.everywhere.desc')}
            </T>
          </Reveal>
        </View>
      </View>

      {/* ── 마지막 CTA (블랙 서피스) ── */}
      <View style={styles.finalSurface} onLayout={registerY('finalcta')}>
        <View style={[styles.contentWrap, styles.centerBlock]}>
          <Reveal visible={!!revealed.finalcta} reduced={reduced} style={styles.centerBlock}>
            <Image
              source={symbolWhite}
              resizeMode="contain"
              accessible={false}
              style={styles.finalMascot}
            />
            <T
              style={[
                styles.finalTitle,
                { fontSize: fluid(width, 24, 38), lineHeight: Math.round(fluid(width, 24, 38) * 1.14) },
              ]}
              accessibilityRole="header"
            >
              {t('home.finalCta.title')}
            </T>
            <Pressable
              onPress={goLogin}
              accessibilityRole="button"
              accessibilityLabel={t('home.finalCta.cta')}
              style={({ pressed }) => [styles.ctaPill, pressed && styles.ctaPillPressed]}
            >
              <T style={styles.ctaPillText}>{t('home.finalCta.cta')}</T>
            </Pressable>
          </Reveal>
        </View>
      </View>

      {/* ── 푸터 ── */}
      <View style={[styles.section, styles.footer]}>
        <View style={[styles.contentWrap, styles.footerRow, wide && styles.footerRowWide]}>
          <View style={styles.footerLinks}>
            <Pressable
              onPress={() => router.push('/privacy')}
              accessibilityRole="link"
              hitSlop={8}
              style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
            >
              <T style={styles.footerLinkText}>{t('home.footer.privacy')}</T>
            </Pressable>
            <T style={styles.footerDot}>·</T>
            <Pressable
              onPress={() => router.push('/terms')}
              accessibilityRole="link"
              hitSlop={8}
              style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
            >
              <T style={styles.footerLinkText}>{t('home.footer.terms')}</T>
            </Pressable>
          </View>
          <T style={styles.footerCopy}>{t('home.footer.copyright')}</T>
        </View>
      </View>
    </ScrollView>
  );
}

// ── 마운트 1회 등장 (rise+fade / materialize). reduce-motion이면 즉시 최종 상태 ──
function Entrance({
  reduced,
  delay,
  dy = 0,
  dscale = 1,
  spring = false,
  style,
  children,
}: {
  reduced: boolean;
  delay: number;
  dy?: number;
  dscale?: number;
  spring?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      p.value = 1;
      return;
    }
    p.value = withDelay(
      delay,
      spring
        ? withSpring(1, SPRING_CRIT)
        : withTiming(1, { duration: 480, easing: EASE_OUT }),
    );
  }, [reduced, delay, spring, p]);
  const a = useAnimatedStyle(() => {
    const t = p.value;
    return {
      opacity: t,
      transform: [
        { translateY: dy * (1 - t) },
        { scale: dscale + (1 - dscale) * t },
      ],
    };
  });
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// ── 스크롤 리빌 (은은한 강화: opacity 0.35→1 + y 16→0, 완전 숨김 금지) ──
function Reveal({
  visible,
  reduced,
  delay = 0,
  style,
  children,
}: {
  visible: boolean;
  reduced: boolean;
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      p.value = 1;
      return;
    }
    if (visible) {
      p.value = withDelay(delay, withTiming(1, { duration: 460, easing: EASE_OUT }));
    }
  }, [visible, reduced, delay, p]);
  const a = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * p.value,
    transform: [{ translateY: 16 * (1 - p.value) }],
  }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}

// 데모 루프의 개별 등장(아래서 위로 스프링) — opacity+translateY.
function FxRise({
  v,
  style,
  children,
}: {
  v: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(v.value, 1),
    transform: [{ translateY: (1 - Math.min(v.value, 1.2)) * 10 }],
  }));
  return (
    <Animated.View style={[style, a]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

// 페이드만 (입력줄 등).
function FxFade({
  v,
  style,
  children,
}: {
  v: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const a = useAnimatedStyle(() => ({ opacity: Math.min(v.value, 1) }));
  return (
    <Animated.View style={[style, a]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

// 카운트 틱/태그 부착 팝 — opacity+scale.
function FxPop({
  v,
  style,
  children,
}: {
  v: SharedValue<number>;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const a = useAnimatedStyle(() => ({
    opacity: Math.min(v.value, 1),
    transform: [{ scale: 0.85 + 0.15 * Math.min(v.value, 1.2) }],
  }));
  return (
    <Animated.View style={[style, a]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

// ── 언어 선택 (select 드롭다운) — 앱 i18n 로직 재사용 ──
function LangSelect({ current }: { current: Language }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.langSelect}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={LANGUAGE_NAMES[current]}
        style={({ pressed }) => [styles.langTrigger, pressed && styles.pressed]}
      >
        <T style={styles.langTriggerText}>{LANGUAGE_NAMES[current]}</T>
        <T style={styles.langCaret}>{open ? '▴' : '▾'}</T>
      </Pressable>
      {open && (
        <>
          {/* 바깥 탭으로 닫기 — 화면 전체를 덮는 투명 캐처 */}
          <Pressable
            style={styles.langBackdrop}
            onPress={() => setOpen(false)}
            accessible={false}
          />
          <View style={styles.langMenu}>
            {SUPPORTED_LANGUAGES.map((lang) => {
              const active = lang === current;
              return (
                <Pressable
                  key={lang}
                  onPress={() => {
                    setOpen(false);
                    void setLanguage(lang);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={LANGUAGE_NAMES[lang]}
                  style={({ pressed }) => [
                    styles.langOption,
                    active && styles.langOptionActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <T style={[styles.langOptionText, active && styles.langOptionTextActive]}>
                    {LANGUAGE_NAMES[lang]}
                  </T>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

// ── 마스코트: 패널 뒤에서 빼꼼 등장 + 느린 상하 bob (reduce-motion 시 정지) ──
function Mascot({ reduced }: { reduced: boolean }) {
  const intro = useSharedValue(reduced ? 1 : 0);
  const bob = useSharedValue(0);

  useEffect(() => {
    if (reduced) {
      intro.value = 1;
      bob.value = 0;
      return;
    }
    intro.value = withDelay(520, withSpring(1, SPRING_CRIT));
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1750, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1750, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(intro);
      cancelAnimation(bob);
    };
  }, [reduced, intro, bob]);

  const a = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [
      { translateX: -PEEK_W / 2 },
      { translateY: (1 - intro.value) * 26 - bob.value * 8 },
    ],
  }));

  return (
    <Animated.Image
      source={symbolWhite}
      resizeMode="contain"
      accessible={false}
      style={[styles.peek, a]}
    />
  );
}

// ── 제품 데모 패널 (라이브 루프 재생) ──
function DemoPanel({ reduced }: { reduced: boolean }) {
  const { t } = useTranslation();

  // 각 요소의 표시 진행값(0=숨김,1=표시). reduce면 최종 상태로 고정.
  const paste = useSharedValue(1);
  const sky = useSharedValue(reduced ? 1 : 0);
  const card = useSharedValue(reduced ? 1 : 0);
  const chip1 = useSharedValue(reduced ? 1 : 0);
  const chip2 = useSharedValue(reduced ? 1 : 0);
  const pink = useSharedValue(reduced ? 1 : 0);
  const yellow = useSharedValue(reduced ? 1 : 0);
  const count = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      // 정적 최종 상태: 모든 메시지 표시, 입력줄은 일반 힌트로.
      paste.value = 1;
      sky.value = 1;
      card.value = 1;
      chip1.value = 1;
      chip2.value = 1;
      pink.value = 1;
      yellow.value = 1;
      count.value = 1;
      return;
    }
    // 메시지 요소: Ta에 등장(팝) → DEMO_R에서 일제히 페이드 → DEMO_L로 패딩. 전 요소 합=DEMO_L(위상 동기).
    const startMsg = (v: SharedValue<number>, ta: number) => {
      v.value = withRepeat(
        withSequence(
          withDelay(ta, withSpring(1, SPRING_POP)),
          withDelay(Math.max(0, DEMO_R - ta - DEMO_APPEAR), withTiming(0, { duration: DEMO_FADE, easing: EASE_OUT })),
          withDelay(Math.max(0, DEMO_L - DEMO_R - DEMO_FADE), withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    };
    // 입력줄: 시작에 보였다가 첫 말풍선 전 사라짐 → 루프 재시작 때 다시.
    paste.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 180 }),
        withDelay(760, withTiming(0, { duration: 300, easing: EASE_OUT })),
        withDelay(DEMO_L - 180 - 760 - 300, withTiming(0, { duration: 0 })),
      ),
      -1,
      false,
    );
    startMsg(sky, 1100);
    startMsg(card, 1350);
    startMsg(chip1, 1900);
    startMsg(chip2, 2150);
    startMsg(pink, 2800);
    startMsg(yellow, 3400);
    startMsg(count, 4000);
    return () => {
      [paste, sky, card, chip1, chip2, pink, yellow, count].forEach(cancelAnimation);
    };
  }, [reduced, paste, sky, card, chip1, chip2, pink, yellow, count]);

  return (
    // 데모 루프 전체는 장식 — 스크린리더에 소음 금지.
    <View
      style={styles.panel}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      <View style={styles.phHead}>
        <View style={styles.phRoom}>
          <Image source={symbolBlack} resizeMode="contain" accessible={false} style={styles.phRoomImg} />
          <T style={styles.phRoomText}>{t('home.demo.room')}</T>
        </View>
        <T style={styles.phTime}>{t('home.demo.time')}</T>
      </View>

      <FxFade v={paste}>
        <View style={styles.paste}>
          <View style={styles.pasteKey}>
            <T style={styles.pasteKeyText}>{t('home.demo.pasteKey')}</T>
          </View>
          <T style={styles.pasteText}>
            {reduced ? t('home.demo.paste') : t('home.demo.pasting')}
          </T>
        </View>
      </FxFade>

      {/* 하늘 말풍선 + 링크카드 + 칩 (순차) */}
      <FxRise v={sky} style={[styles.bubble, styles.bubbleSky]}>
        <T style={[styles.bubbleText, styles.bubbleTextSky]}>{t('home.demo.bubbleVideo')}</T>
        <FxRise v={card} style={styles.card}>
          <LinearGradient
            colors={['#BFE0F0', '#9CCBE4']}
            start={{ x: 0, y: 1 }}
            end={{ x: 0, y: 0 }}
            style={styles.cardThumb}
          >
            <RNText style={styles.cardThumbEmoji}>☕</RNText>
          </LinearGradient>
          <T style={styles.cardTitle}>{t('home.demo.cardTitle')}</T>
          <T style={styles.cardSource}>{t('home.demo.cardSource')}</T>
        </FxRise>
        <View style={styles.chips}>
          <FxPop v={chip1} style={styles.chip}>
            <T style={styles.chipText}>{t('home.demo.chipVideo')}</T>
          </FxPop>
          <FxPop v={chip2} style={styles.chip}>
            <T style={styles.chipText}>{t('home.demo.chipWeekend')}</T>
          </FxPop>
        </View>
      </FxRise>

      <FxRise v={pink} style={[styles.bubble, styles.bubblePink]}>
        <T style={[styles.bubbleText, styles.bubbleTextPink]}>{t('home.demo.bubbleGift')}</T>
      </FxRise>
      <FxRise v={yellow} style={[styles.bubble, styles.bubbleYellow]}>
        <T style={[styles.bubbleText, styles.bubbleTextYellow]}>{t('home.demo.bubbleRestaurant')}</T>
      </FxRise>

      <FxPop v={count}>
        <T style={styles.autoLabel}>{t('home.demo.summary')}</T>
      </FxPop>
    </View>
  );
}

// ── 대비 스트립 (문제 dim vs 슬래시 파스텔) ──
function ContrastStrip({ wide }: { wide: boolean }) {
  const { t } = useTranslation();
  // 슬래시 셀은 앱의 puffy 말풍선 문법(파스텔 채움 + 2px 틴트 보더)을 그대로 빌린다.
  const rows: { key: 'save' | 'organize' | 'find'; bubble: (typeof BUBBLE)[keyof typeof BUBBLE] }[] = [
    { key: 'save', bubble: BUBBLE.pink },
    { key: 'organize', bubble: BUBBLE.yellow },
    { key: 'find', bubble: BUBBLE.sky },
  ];
  return (
    <View style={styles.contrastList}>
      {wide && (
        <View style={styles.contrastHeaderRow}>
          <View style={styles.contrastLabelCol} />
          <T style={[styles.contrastColHead, styles.contrastCell]}>{t('home.contrast.colProblem')}</T>
          <T style={[styles.contrastColHead, styles.contrastCell]}>{t('home.contrast.colSlash')}</T>
        </View>
      )}
      {rows.map(({ key, bubble }) => (
        <View key={key} style={[styles.contrastRow, wide && styles.contrastRowWide]}>
          <View style={styles.contrastLabelCol}>
            <T style={styles.contrastLabel}>{t(`home.contrast.${key}.label`)}</T>
          </View>
          <View style={styles.contrastCell}>
            <View style={styles.cProblem}>
              <T style={styles.cProblemText}>{t(`home.contrast.${key}.problem`)}</T>
            </View>
          </View>
          <View style={styles.contrastCell}>
            <View style={[styles.cSlash, { backgroundColor: bubble.bg, borderColor: bubble.bd }]}>
              <T style={[styles.cSlashText, { color: bubble.tx }]}>{t(`home.contrast.${key}.slash`)}</T>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── 키워드 자동 태그 미니 데모 (뷰포트 진입 시 루프) ──
function KeywordDemo({ visible, reduced }: { visible: boolean; reduced: boolean }) {
  const { t } = useTranslation();
  const tag1 = useSharedValue(reduced ? 1 : 0);
  const tag3 = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    if (reduced) {
      tag1.value = 1;
      tag3.value = 1;
      return;
    }
    if (!visible) {
      tag1.value = 0;
      tag3.value = 0;
      return;
    }
    const L = 5500;
    const R = 4000;
    const start = (v: SharedValue<number>, ta: number) => {
      v.value = withRepeat(
        withSequence(
          withDelay(ta, withSpring(1, SPRING_POP)),
          withDelay(Math.max(0, R - ta - DEMO_APPEAR), withTiming(0, { duration: 450, easing: EASE_OUT })),
          withDelay(Math.max(0, L - R - 450), withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      );
    };
    start(tag1, 800);
    start(tag3, 1500);
    return () => {
      cancelAnimation(tag1);
      cancelAnimation(tag3);
    };
  }, [visible, reduced, tag1, tag3]);

  const rows: { text: string; tag: SharedValue<number> | null }[] = [
    { text: t('home.keyword.row1'), tag: tag1 },
    { text: t('home.keyword.row2'), tag: null },
    { text: t('home.keyword.row3'), tag: tag3 },
  ];

  return (
    <View
      style={styles.kwCard}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
    >
      {/* 태그 정의 칩 + 키워드 */}
      <View style={styles.kwDefRow}>
        <View style={styles.kwDefChip}>
          <T style={styles.kwDefChipText}>{t('home.keyword.chipLabel')}</T>
        </View>
        <T style={styles.kwKeywords}>
          {t('home.keyword.keywordsCaption')}: {t('home.keyword.chipKeywords')}
        </T>
      </View>
      <View style={styles.kwDivider} />
      {/* 기존 메모 행 — 매칭 행에 태그가 순차 부착 */}
      {rows.map((r, i) => (
        <View key={i} style={styles.kwRow}>
          <T style={styles.kwRowText} numberOfLines={1}>
            {r.text}
          </T>
          {r.tag && (
            <FxPop v={r.tag} style={styles.kwRowTag}>
              <T style={styles.kwRowTagText}>{t('home.keyword.chipLabel')}</T>
            </FxPop>
          )}
        </View>
      ))}
    </View>
  );
}

// ── 기능 스티커 항목 (리빌 + 아이들 플로트) ──
function Feature({
  color,
  rotate,
  index,
  visible,
  reduced,
  title,
  desc,
  titleSize,
}: {
  color: string;
  rotate: number;
  index: number;
  visible: boolean;
  reduced: boolean;
  title: string;
  desc: string;
  titleSize: number;
}) {
  const p = useSharedValue(reduced ? 1 : 0); // 리빌
  const f = useSharedValue(0.5); // 플로트 위상 (0.5=중심 → translateY 0)

  useEffect(() => {
    if (reduced) {
      p.value = 1;
      return;
    }
    if (visible) {
      p.value = withDelay(index * 70, withTiming(1, { duration: 460, easing: EASE_OUT }));
    }
  }, [visible, reduced, index, p]);

  useEffect(() => {
    if (reduced) return;
    const period = 1600 + index * 240;
    f.value = withDelay(
      index * 400,
      withRepeat(
        withSequence(
          withTiming(1, { duration: period, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: period, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(f);
  }, [reduced, index, f]);

  const wrapA = useAnimatedStyle(() => ({
    opacity: 0.35 + 0.65 * p.value,
    transform: [{ translateY: 16 * (1 - p.value) }],
  }));
  const floatA = useAnimatedStyle(() => ({
    transform: [{ translateY: (f.value - 0.5) * 8 }],
  }));

  return (
    <Animated.View style={[styles.feature, wrapA]}>
      <Animated.View style={[styles.stickerRing, floatA]}>
        <View style={[styles.sticker, { backgroundColor: color }]}>
          <Image
            source={charLine}
            resizeMode="contain"
            accessible={false}
            style={[styles.stickerImg, { transform: [{ rotate: `${rotate}deg` }] }]}
          />
        </View>
      </Animated.View>
      <T style={[styles.featureTitle, { fontSize: titleSize }]}>{title}</T>
      <T style={styles.featureDesc}>{desc}</T>
    </Animated.View>
  );
}

// ── 점선 리더라인 ──
function LeaderLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.leaderRow}>
      <T style={styles.leaderLabel}>{label}</T>
      <View style={styles.leaderDots} />
      <T style={styles.leaderValue}>{value}</T>
    </View>
  );
}

// ── 보기 방식 미니 패널 (도식) ──
function ChatMini({ caption }: { caption: string }) {
  return (
    <View style={styles.viewCol}>
      <View style={styles.miniPanel} accessible={false}>
        <View style={[styles.miniBubble, { backgroundColor: BUBBLE.pink.bg, borderColor: PINK, width: '62%' }]} />
        <View style={[styles.miniBubble, { backgroundColor: BUBBLE.sky.bg, borderColor: SKY, width: '78%' }]} />
        <View style={[styles.miniBubble, { backgroundColor: BUBBLE.yellow.bg, borderColor: YELLOW, width: '52%' }]} />
      </View>
      <T style={styles.viewCaption}>{caption}</T>
    </View>
  );
}

function ListMini({ caption }: { caption: string }) {
  const dots = [PINK, SKY, YELLOW, PINK];
  return (
    <View style={styles.viewCol}>
      <View style={[styles.miniPanel, styles.miniPanelList]} accessible={false}>
        {dots.map((c, i) => (
          <View key={i} style={styles.miniRow}>
            <View style={[styles.miniDot, { backgroundColor: c }]} />
            <View style={[styles.miniBar, { width: `${70 - i * 8}%` }]} />
          </View>
        ))}
      </View>
      <T style={styles.viewCaption}>{caption}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: PAGE,
  },
  rootContent: {
    minHeight: '100%',
  },
  contentWrap: {
    width: '100%',
    maxWidth: CONTENT_MAX,
    alignSelf: 'center',
    paddingHorizontal: 24,
  },
  centerBlock: {
    alignItems: 'center',
  },
  centerText: {
    textAlign: 'center',
  },
  // 눌림 피드백 (즉시 scale 0.97) — apple-design §1
  pressed: {
    transform: [{ scale: 0.97 }],
  },

  // ── 히어로 서피스 ──
  heroSurface: {
    backgroundColor: SURFACE_DARK,
    paddingBottom: 64,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    // 언어 드롭다운이 히어로 위로 뜨도록
    zIndex: 50,
  },
  logo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoImg: {
    width: 30 * SYMBOL_RATIO,
    height: 30,
  },
  logoText: {
    color: WHITE,
    fontWeight: '900',
    fontSize: 21,
    letterSpacing: -0.4,
  },
  navRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flexShrink: 1,
  },
  langSelect: {
    zIndex: 60,
  },
  langTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  langTriggerText: {
    color: WHITE,
    fontSize: 14,
    fontWeight: '600',
  },
  langCaret: {
    color: ON_DARK_MUTED,
    fontSize: 10,
  },
  langBackdrop: {
    position: 'absolute',
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
  },
  langMenu: {
    position: 'absolute',
    top: 48,
    right: 0,
    minWidth: 148,
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 8,
  },
  langOption: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  langOptionActive: {
    backgroundColor: '#F2F3F7',
  },
  langOptionText: {
    color: INK,
    fontSize: 14,
  },
  langOptionTextActive: {
    fontWeight: '800',
  },
  loginPill: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: WHITE,
    borderRadius: 999,
    paddingHorizontal: 22,
    flexShrink: 0,
  },
  loginPillText: {
    color: WHITE,
    fontWeight: '700',
    fontSize: 15,
  },

  hero: {
    marginTop: 20,
    flexDirection: 'column',
    gap: 44,
  },
  heroWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 40,
  },
  heroCopy: {
    width: '100%',
  },
  heroCopyWide: {
    flex: 1.05,
  },
  h1: {
    color: WHITE,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  heroSub: {
    color: ON_DARK_SUB,
    marginTop: 20,
    maxWidth: 460,
  },
  ctaRow: {
    marginTop: 34,
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 14,
  },
  ctaRowWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  ctaPill: {
    backgroundColor: WHITE,
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 40,
    minHeight: 44,
    justifyContent: 'center',
    // 소프트 섀도 (랜딩 예외 허용)
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 6,
  },
  ctaPillPressed: {
    backgroundColor: '#EDEDEF',
    transform: [{ scale: 0.97 }],
  },
  ctaPillText: {
    color: INK_STRONG,
    fontWeight: '900',
    fontSize: 17,
    textAlign: 'center',
  },
  // ── 데모 패널 ──
  demoWrap: {
    position: 'relative',
    alignItems: 'center',
    paddingTop: 56,
  },
  demoWrapWide: {
    flex: 0.95,
  },
  demoPanelEntrance: {
    width: '100%',
    alignItems: 'center',
    zIndex: 1,
  },
  peek: {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: PEEK_W,
    height: PEEK_W / SYMBOL_RATIO,
    zIndex: 0,
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 18,
    paddingBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 48,
    elevation: 12,
  },
  phHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    marginBottom: 12,
  },
  phRoom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phRoomImg: {
    width: 20 * SYMBOL_RATIO,
    height: 20,
  },
  phRoomText: {
    fontWeight: '800',
    fontSize: 15,
    color: INK,
  },
  phTime: {
    fontFamily: MONO,
    fontSize: 11,
    color: MONO_MUTED,
  },
  paste: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F4F5F9',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  pasteKey: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: '#DDDDDD',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  pasteKeyText: {
    fontFamily: MONO,
    fontSize: 11,
    color: '#444444',
  },
  pasteText: {
    fontSize: 13,
    color: '#666666',
    flexShrink: 1,
  },
  bubble: {
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginVertical: 5,
    alignSelf: 'flex-end',
    maxWidth: '90%',
  },
  bubbleSky: { backgroundColor: BUBBLE.sky.bg, borderWidth: 2, borderColor: SKY },
  bubblePink: { backgroundColor: BUBBLE.pink.bg, borderWidth: 2, borderColor: PINK },
  bubbleYellow: { backgroundColor: BUBBLE.yellow.bg, borderWidth: 2, borderColor: YELLOW },
  bubbleText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  bubbleTextSky: { color: BUBBLE.sky.tx, fontWeight: '400' },
  bubbleTextPink: { color: BUBBLE.pink.tx },
  bubbleTextYellow: { color: BUBBLE.yellow.tx },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8E8F2',
    marginTop: 8,
    backgroundColor: WHITE,
  },
  cardThumb: {
    height: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardThumbEmoji: {
    fontSize: 26,
  },
  cardTitle: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    color: INK,
    fontWeight: '700',
    fontSize: 12,
  },
  cardSource: {
    paddingHorizontal: 10,
    paddingBottom: 9,
    color: '#888888',
    fontSize: 11,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  chip: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: '#DDDDDD',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#555555',
  },
  autoLabel: {
    textAlign: 'center',
    fontSize: 11,
    color: MONO_MUTED,
    marginTop: 10,
    fontFamily: MONO,
  },

  // ── 섹션 공통 ──
  section: {
    paddingVertical: 64,
  },
  sectionWhite: {
    backgroundColor: PAGE,
  },
  sectionTint: {
    backgroundColor: TINT,
  },
  sectionH: {
    color: INK,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  sectionSub: {
    color: INK_SOFT,
    fontSize: 16,
    lineHeight: 26,
    marginTop: 12,
    maxWidth: 560,
  },

  // ── 대비 스트립 ──
  contrastHeading: {
    marginBottom: 28,
  },
  contrastList: {
    gap: 14,
  },
  contrastHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  contrastColHead: {
    fontSize: 12,
    fontFamily: MONO,
    color: MONO_MUTED,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  contrastRow: {
    flexDirection: 'column',
    gap: 8,
  },
  contrastRowWide: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  contrastLabelCol: {
    width: 84,
    justifyContent: 'center',
  },
  contrastLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: INK,
  },
  contrastCell: {
    flex: 1,
  },
  cProblem: {
    flex: 1,
    backgroundColor: TINT,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  cProblemText: {
    color: DIM,
    fontSize: 14,
    lineHeight: 20,
  },
  // puffy 말풍선 문법 — 색(bg/border/text)은 행별 BUBBLE 팔레트가 인라인 주입
  cSlash: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 13,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  cSlashText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },

  // ── 키워드 데모 ──
  keywordWrap: {
    flexDirection: 'column',
    gap: 28,
  },
  keywordWrapWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 48,
  },
  keywordCopy: {
    width: '100%',
  },
  keywordCopyWide: {
    flex: 1,
  },
  keywordDemoWrap: {
    width: '100%',
    alignItems: 'center',
  },
  keywordDemoWrapWide: {
    flex: 1,
  },
  kwCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 3,
  },
  kwDefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  kwDefChip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: BUBBLE.pink.bg,
    borderWidth: 1.5,
    borderColor: PINK,
  },
  kwDefChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: BUBBLE.pink.tx,
  },
  kwKeywords: {
    fontSize: 12,
    fontFamily: MONO,
    color: MONO_MUTED,
    flexShrink: 1,
  },
  kwDivider: {
    height: 1,
    backgroundColor: HAIRLINE,
    marginVertical: 14,
  },
  kwRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
  },
  kwRowText: {
    fontSize: 14,
    color: INK,
    flexShrink: 1,
  },
  kwRowTag: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
    backgroundColor: BUBBLE.pink.bg,
    borderWidth: 1.5,
    borderColor: PINK,
  },
  kwRowTagText: {
    fontSize: 11,
    fontWeight: '800',
    color: BUBBLE.pink.tx,
  },

  // ── 기능 ──
  features: {
    flexDirection: 'column',
    gap: 40,
  },
  featuresWide: {
    flexDirection: 'row',
    gap: 32,
  },
  feature: {
    flex: 1,
    alignItems: 'flex-start',
  },
  stickerRing: {
    borderRadius: 999,
    backgroundColor: WHITE,
    padding: 5,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 4,
  },
  sticker: {
    width: 96,
    height: 92,
    borderTopLeftRadius: 44,
    borderTopRightRadius: 48,
    borderBottomLeftRadius: 46,
    borderBottomRightRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerImg: {
    width: 70,
    height: 70,
  },
  featureTitle: {
    color: INK,
    fontWeight: '800',
    marginBottom: 8,
  },
  featureDesc: {
    color: INK_SOFT,
    fontSize: 15,
    lineHeight: 24,
  },

  // ── 리더라인 ──
  leader: {
    marginTop: 48,
    maxWidth: 520,
    gap: 12,
  },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  leaderLabel: {
    fontSize: 14,
    color: INK_SOFT,
  },
  leaderDots: {
    flex: 1,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderBottomColor: DOTS,
    transform: [{ translateY: -3 }],
  },
  leaderValue: {
    fontFamily: MONO,
    fontSize: 12,
    color: INK_STRONG,
    letterSpacing: 0.4,
  },

  // ── 보기 방식 ──
  viewPanels: {
    marginTop: 36,
    flexDirection: 'column',
    gap: 28,
  },
  viewPanelsWide: {
    flexDirection: 'row',
    gap: 28,
  },
  viewCol: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
  },
  miniPanel: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: HAIRLINE,
    padding: 18,
    gap: 10,
    minHeight: 150,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 3,
  },
  miniPanelList: {
    justifyContent: 'center',
  },
  miniBubble: {
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignSelf: 'flex-end',
  },
  miniRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  miniDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  miniBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E3E6EF',
  },
  viewCaption: {
    fontSize: 14,
    fontWeight: '700',
    color: INK_SOFT,
  },

  // ── 마지막 CTA ──
  finalSurface: {
    backgroundColor: SURFACE_DARK,
    paddingVertical: 72,
    alignItems: 'center',
  },
  finalMascot: {
    width: 76,
    height: 76 / SYMBOL_RATIO,
    marginBottom: 20,
  },
  finalTitle: {
    color: WHITE,
    fontWeight: '900',
    letterSpacing: -0.8,
    textAlign: 'center',
    maxWidth: 560,
    marginBottom: 32,
  },

  // ── 푸터 ──
  footer: {
    backgroundColor: PAGE,
    paddingVertical: 40,
    borderTopWidth: 1,
    borderTopColor: HAIRLINE,
  },
  footerRow: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  footerRowWide: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  footerLinkText: {
    fontSize: 14,
    color: INK_SOFT,
    fontWeight: '600',
  },
  footerDot: {
    color: DOTS,
  },
  footerCopy: {
    fontSize: 13,
    color: MONO_MUTED,
    fontFamily: MONO,
  },
});
