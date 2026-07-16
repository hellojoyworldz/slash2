import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil } from 'lucide-react-native';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { GoogleLogo } from '../components/GoogleLogo';
import { Text } from '../components/Text';
import { useNameEdit } from '../name-edit';
import {
  LANGUAGE_NAMES,
  Language,
  setLanguage,
  SUPPORTED_LANGUAGES,
} from '../i18n';
import { layout, ThemeColors } from '../theme';
import { ThemeMode, useTheme } from '../theme-context';

// 다크모드 3택. key는 setMode에 그대로 전달.
const MODE_OPTIONS: { key: ThemeMode; labelKey: string }[] = [
  { key: 'light', labelKey: 'more.modeLight' },
  { key: 'dark', labelKey: 'more.modeDark' },
  { key: 'system', labelKey: 'more.modeSystem' },
];

interface Props {
  email: string;
  displayName: string | null;
  // 연결된 소셜 provider 목록 (예: ['google']). 이메일 옆 배지 표시용.
  providers: string[];
  onLogout: () => void;
}

export function MoreScreen({ email, displayName, providers, onLogout }: Props) {
  const { t, i18n } = useTranslation();
  const { colors, mode, setMode } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const current = i18n.language as Language;
  // 표시 이름이 없으면 이메일 앞부분으로 폴백
  const name = displayName || email.split('@')[0] || t('common.me');

  // 이름 편집: 연필 아이콘 → 루트 상주 오버레이 (900px 교차 리마운트에도 유지)
  const { openNameEditor } = useNameEdit();

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text variant="title">{t('more.title')}</Text>
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
            </View>
          </View>
          <TouchableOpacity
            onPress={openNameEditor}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('more.editName')}
          >
            <Pencil size={18} strokeWidth={2} color={colors.textTertiary} />
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
    paddingTop: layout.statusBarPad + 4,
    paddingBottom: 14,
    paddingHorizontal: 20,
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
  logoutBtn: {
    marginHorizontal: 20,
    marginTop: 24,
  },
});
