import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ExternalLink } from 'lucide-react-native';
import {
  FlatList,
  Linking,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import { Text } from '../components/Text';
import licenses from '../generated/licenses.json';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// 오픈소스 라이선스 화면 — 더보기 > 앱 정보 > 오픈소스 라이선스.
// generated/licenses.json(빌드 스크립트 산출물)을 읽어 라이브러리별
// 이름·버전·라이선스 종류를 나열하고, 행을 누르면 저장소를 브라우저로 연다.
//
// 데스크톱(≥900)에서는 (tabs) 레이아웃의 목록 패널(TabSlot)에 렌더되고,
// 모바일에서는 하단 탭바가 유지된 전폭 화면이 된다 — 더보기와 같은 문법.

interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  repository?: string;
}

const DATA = licenses as LicenseEntry[];

interface Props {
  // 데스크톱 3패널의 오른쪽 상세 패널로 렌더될 때 넘긴다 — 뒤로가기가 라우팅 대신
  // 이 콜백(정보 문서 닫기 → 직전 방 복귀)을 부른다. 모바일 전폭 라우트에선 생략(라우터 back).
  onBack?: () => void;
  // 데스크톱 오른쪽 패널에선 뒤로가기 버튼을 숨긴다 (ChatScreen과 동일 컨벤션).
  showBack?: boolean;
}

export function LicensesScreen({ onBack, showBack = true }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isMobile = width < layout.desktopBreakpoint;
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const renderItem = ({ item }: { item: LicenseEntry }) => {
    const hasRepo = !!item.repository;
    const open = () => {
      if (item.repository) Linking.openURL(item.repository);
    };
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={open}
        disabled={!hasRepo}
        activeOpacity={0.6}
        accessibilityRole={hasRepo ? 'link' : undefined}
        accessibilityLabel={`${item.name}, ${item.license}`}
      >
        <View style={styles.rowText}>
          <Text variant="label" numberOfLines={1}>
            {item.name}
          </Text>
          <Text
            variant="caption"
            color={colors.textSecondary}
            numberOfLines={1}
            style={styles.license}
          >
            {item.license}
          </Text>
        </View>
        <View style={styles.rowMeta}>
          {item.version ? (
            <Text variant="micro" color={colors.textTertiary}>
              {item.version}
            </Text>
          ) : null}
          {hasRepo ? (
            <ExternalLink size={15} strokeWidth={2} color={colors.textTertiary} />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* 뒤로가기 = /more 링크(진입점이 더보기뿐). 데스크톱 우패널(showBack=false)에선 숨김.
            imperative router.back()/replace()는 트리 스왑 직후 무시되거나 URL을 남겨서 쓰지 않는다. */}
        {showBack && (
          <Link href="/more" asChild>
            <TouchableOpacity
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('a11y.back')}
              style={styles.back}
            >
              <ChevronLeft size={26} strokeWidth={2} color={colors.ink} />
            </TouchableOpacity>
          </Link>
        )}
        <View style={styles.titleCol}>
          <Text variant="heading" numberOfLines={1}>
            {t('licenses.title')}
          </Text>
        </View>
      </View>

      <FlatList
        data={DATA}
        keyExtractor={(item) => item.name}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={!isMobile}
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
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: layout.statusBarPad + 4,
      paddingBottom: 14,
      paddingHorizontal: 20,
    },
    back: {
      marginRight: 8,
      marginLeft: -6,
    },
    titleCol: {
      flexShrink: 1,
    },
    listContent: {
      paddingBottom: layout.bottomPad + 24,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 56,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    rowText: {
      flex: 1,
      marginRight: 12,
    },
    license: {
      marginTop: 2,
    },
    rowMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    // 콘텐츠 구분선은 점선 + 가장 연한 회색 (DESIGN: dotted 구분선).
    separator: {
      marginHorizontal: 20,
      borderBottomWidth: 1,
      borderStyle: 'dotted',
      borderColor: colors.hairline,
    },
  });
