import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react-native';
import {
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '../components/Text';
import { Language, SUPPORTED_LANGUAGES } from '../i18n';
import { LegalDocKind, LEGAL_CONTENT } from '../legal-content';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// 법적 문서 화면(개인정보처리방침·이용약관) — 더보기 > 앱 정보에서 진입.
// (tabs) 그룹 밖 최상위 단독 라우트(/privacy·/terms)라 레일·탭바 크롬 없이 전폭
// 문서 페이지로 렌더된다(모든 폼팩터 동일). 넓은 화면에선 본문을 가독 폭으로 가운데 제한.
// 뒤로가기는 더보기에서 왔으면 router.back, URL 직접 진입(웹 공개 링크)이면 '/'로 폴백.
//
// ⚠️ 문서 문구는 법률 자문이 아닌 개발용 초안이다(legal-content.ts 참고).
//    배포 전 법률 검토 및 플레이스홀더(문의 이메일·시행일·최종 수정일) 교체 필수.

// 긴 본문 가독 폭 상한 — 넓은 데스크톱에서 한 줄이 너무 길어지지 않게 가운데 열로 제한.
const READABLE_MAX = 760;

interface Props {
  doc: LegalDocKind;
}

export function LegalScreen({ doc }: Props) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < layout.desktopBreakpoint;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  // 현재 언어의 문서. i18n.language가 지원 밖(리전 코드 등)이면 ko로 폴백.
  const lang: Language = SUPPORTED_LANGUAGES.includes(i18n.language as Language)
    ? (i18n.language as Language)
    : 'ko';
  const document = LEGAL_CONTENT[lang][doc];

  // 더보기에서 push로 왔으면 뒤로, 웹에서 URL로 바로 열렸으면(공개 링크) 홈('/')으로 폴백.
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={styles.container}>
      {/* 헤더도 본문과 같은 가독 열 폭으로 가운데 정렬(넓은 화면에서 뒤로가기·타이틀이 본문과 축 맞춤). */}
      <View style={styles.header}>
        <View style={styles.readableRow}>
          <TouchableOpacity
            onPress={goBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.back')}
            style={styles.back}
          >
            <ChevronLeft size={26} strokeWidth={2} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.titleCol}>
            <Text variant="title" accessibilityRole="header">
              {document.title}
            </Text>
            <Text variant="caption" color={colors.textSecondary} style={styles.subtitle}>
              {document.lastUpdatedLabel} · {document.lastUpdated}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={!isMobile}
      >
        <View style={styles.readable}>
          {document.intro.map((para, i) => (
            <Text
              key={`intro-${i}`}
              variant="body"
              color={colors.textSecondary}
              style={styles.paragraph}
            >
              {para}
            </Text>
          ))}

          {document.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <Text
                variant="subheading"
                accessibilityRole="header"
                style={styles.heading}
              >
                {section.heading}
              </Text>
              {section.body.map((para, i) => (
                <Text
                  key={i}
                  variant="body"
                  color={colors.textSecondary}
                  style={styles.paragraph}
                >
                  {para}
                </Text>
              ))}
            </View>
          ))}

          <Text variant="caption" color={colors.textTertiary} style={styles.effective}>
            {document.effectiveNote}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      // 바깥은 상단 여백만 + 가운데 정렬(안쪽 readableRow가 실제 폭·좌우 여백을 잡는다).
      alignItems: 'center',
      paddingTop: layout.statusBarPad + 4,
      paddingBottom: 14,
    },
    // 헤더 내용(뒤로가기+타이틀)을 가독 열 폭으로 제한 + 좌우 여백.
    readableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      maxWidth: READABLE_MAX,
      paddingHorizontal: 20,
    },
    back: {
      marginRight: 8,
      marginLeft: -6,
    },
    titleCol: {
      flexShrink: 1,
    },
    subtitle: {
      marginTop: 4,
    },
    scroll: {
      flex: 1,
    },
    // 본문은 가운데 정렬 — 실제 폭·좌우 여백은 readable 래퍼가 잡는다.
    scrollContent: {
      alignItems: 'center',
      paddingBottom: layout.bottomPad + 32,
    },
    // 본문 가독 열 — 넓은 화면에서 한 줄이 길어지지 않게 상한, 좁으면 전폭.
    readable: {
      width: '100%',
      maxWidth: READABLE_MAX,
      paddingHorizontal: 20,
    },
    section: {
      marginTop: 24,
    },
    heading: {
      marginBottom: 10,
    },
    // 문단 사이 넉넉한 행간·간격 — 긴 본문의 가독성(다국어 길이 변화 대비).
    paragraph: {
      lineHeight: 22,
      marginBottom: 10,
    },
    effective: {
      marginTop: 28,
    },
  });
