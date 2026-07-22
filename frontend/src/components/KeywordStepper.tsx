import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react-native';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { InfoPopover } from './InfoPopover';
import { Text } from './Text';

// 자동 부착 키워드 스테퍼 — 태그 생성·수정 모달이 공유한다(중복 구현 금지).
// 마지막 행은 [입력][+ 추가], 그 위 행들은 [입력][− 제거] — 버튼은 항상 입력창 옆에 붙는다.
// max에 다다르면 마지막 행도 [−]. 값은 부모가 소유(controlled).
// 바닥 상태: 키워드 0개여도 항상 빈 입력창 1개가 보인다(display로 파생) — 그 한 행의 버튼이 [+].
// 마지막 남은 행은 제거 불가(cleanKeywords가 저장 시 빈 값을 드롭하므로 비워두면 키워드 없음).
// 라벨 옆 ⓘ 안내는 공용 InfoPopover(말풍선 팝오버)로 띄운다.

export const MAX_TAG_KEYWORDS = 10;
const KEYWORD_MAXLEN = 30;

// 저장 유효 키워드: 트림 → 빈 제거 → 대소문자 무시 중복 제거 → 상한 컷. 태그는 0개 허용.
export function cleanKeywords(keywords: string[], max = MAX_TAG_KEYWORDS): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const v = k.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.slice(0, max);
}

interface Props {
  keywords: string[];
  onChange: (next: string[]) => void;
  max?: number;
}

export function KeywordStepper({ keywords, onChange, max = MAX_TAG_KEYWORDS }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 바닥 상태 보장: 실제 값이 비어도 화면엔 빈 입력창 1개(파생). 부모 상태는 그대로 비어 있다.
  const display = keywords.length ? keywords : [''];

  const setAt = (index: number, value: string) =>
    onChange(display.map((k, i) => (i === index ? value : k)));
  const add = () => {
    if (display.length < max) onChange([...display, '']);
  };
  const remove = (index: number) => {
    if (display.length > 1) onChange(display.filter((_, i) => i !== index));
  };

  return (
    <>
      {/* 라벨 + ⓘ 안내(팝오버는 루트 오버레이로 뜬다). */}
      <View style={styles.labelRow}>
        <Text variant="caption" color={colors.textSecondary}>
          {t('tags.keywordsLabel')}
        </Text>
        <InfoPopover text={t('tags.keywordsHint')} label={t('tags.keywordsInfo')} />
      </View>

      {display.map((kw, i) => {
        // 마지막 행이면서 아직 max 미만이면 [+], 아니면 [−]. 마지막 남은 한 행은 제거 불가.
        const isAddRow = i === display.length - 1 && display.length < max;
        return (
          <View key={i} style={styles.row}>
            <TextInput
              style={[styles.input, styles.rowInput]}
              value={kw}
              onChangeText={(text) => setAt(i, text)}
              placeholder={t('tags.keywordPlaceholder')}
              placeholderTextColor={colors.textTertiary}
              maxLength={KEYWORD_MAXLEN}
              returnKeyType="done"
            />
            {isAddRow ? (
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={add}
                accessibilityRole="button"
                accessibilityLabel={t('tags.addKeyword')}
              >
                <Plus size={16} strokeWidth={2} color={colors.ink} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => remove(i)}
                disabled={display.length <= 1}
                accessibilityRole="button"
                accessibilityLabel={t('tags.removeKeyword')}
              >
                <Minus size={16} strokeWidth={2} color={colors.ink} />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 16,
      marginBottom: 10,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    rowInput: {
      flex: 1,
    },
    // ±: 1px 보더 정사각 스텝 버튼(라운드 0) — 입력창 높이에 맞춘 44 터치 타깃.
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
