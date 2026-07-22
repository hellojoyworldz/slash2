import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Megaphone } from 'lucide-react-native';
import { LinkType, Message } from '../api';
import { formatDateStamp } from '../time';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { RemoteImage } from './RemoteImage';
import { Text } from './Text';

// 자동구분 종류 → 카드 꼬리표(대문자 모노 글리프). 미분류 링크는 LINK, 메모는 MEMO.
const TAG_BY_TYPE: Record<LinkType, string> = {
  place: 'PLACE',
  video: 'VIDEO',
  item: 'ITEM',
};

function messageTag(m: Message): string {
  if (m.kind === 'text') return 'MEMO';
  return (m.linkType && TAG_BY_TYPE[m.linkType]) || 'LINK';
}

interface Props {
  message: Message;
  /** 카드 폭(그리드 열 폭). 컨테이너 비례로 계산돼 넘어온다. */
  width: number;
  /** 이 메시지가 속한 분류색(hex). 섹션이 이름을 담당하므로 카드엔 색 점만 얹는다. */
  color?: string | null;
  /** 이 메시지에 붙은 태그 이름들. #태그명 micro 모노 한 줄로 표시. */
  tagNames?: string[] | null;
  onPress: (message: Message) => void;
  onLongPress: (message: Message) => void;
}

// 노션 갤러리 카드: [썸네일(ogImage·없으면 ✳ 자리)] → [제목] → [색점 · ✳ TYPE 모노] → [날짜 모노].
// surface 채움·보더 없음·라운드 0(BAT/브루탈 문법). 색은 분류 점에만(중립 크롬 유지).
export function GalleryCard({
  message,
  width,
  color,
  tagNames,
  onPress,
  onLongPress,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isMemo = message.kind === 'text';
  const isLink = message.kind === 'link' && !!message.url;
  const isPlace = message.linkType === 'place';
  const thumbUri = message.ogImage ?? null;
  // 제목: 링크는 ogTitle ?? url, 메모는 본문.
  const title = isMemo
    ? message.content
    : message.ogTitle ?? message.url ?? message.content;

  return (
    <TouchableOpacity
      style={[styles.card, { width }]}
      activeOpacity={0.7}
      onPress={() => onPress(message)}
      onLongPress={() => onLongPress(message)}
      accessibilityRole={isLink ? (isPlace ? 'button' : 'link') : undefined}
    >
      {thumbUri ? (
        <RemoteImage uri={thumbUri} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Text style={styles.placeholderGlyph} color={colors.textTertiary}>
            ✳
          </Text>
        </View>
      )}
      <View style={styles.body}>
        <Text
          variant={isMemo ? 'body' : 'bodyStrong'}
          color={isMemo ? colors.textSecondary : colors.textPrimary}
          style={styles.title}
          numberOfLines={2}
        >
          {title}
        </Text>
        <View style={styles.tagRow}>
          <View style={[styles.colorDot, { backgroundColor: color ?? colors.surface }]} />
          <Text
            variant="micro"
            color={colors.textTertiary}
            style={styles.tag}
            numberOfLines={1}
          >
            {`✳ ${messageTag(message)}`}
          </Text>
        </View>
        <Text variant="micro" color={colors.textTertiary} style={styles.date}>
          {formatDateStamp(message.createdAt)}
        </Text>
        {message.isNotice || (tagNames && tagNames.length) ? (
          <View style={styles.tagLineRow}>
            {message.isNotice ? (
              <View
                style={styles.noticeChip}
                accessible
                accessibilityLabel={t('chat.noticeTag')}
              >
                <Megaphone size={11} strokeWidth={2} color={colors.textTertiary} />
              </View>
            ) : null}
            {tagNames && tagNames.length ? (
              <Text
                variant="micro"
                color={colors.textTertiary}
                style={styles.tagLine}
                numberOfLines={1}
              >
                {tagNames.map((n) => `#${n}`).join(' ')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // surface 채움 카드(보더 없음·라운드 0). 그림자 금지.
    card: {
      backgroundColor: colors.surface,
      borderRadius: 0,
      overflow: 'hidden',
    },
    thumb: {
      width: '100%',
      aspectRatio: 1.5,
      backgroundColor: colors.background,
    },
    // 썸네일 없음 — background 면 위 ✳ 글리프(카드 surface와 톤 차이로 구분).
    thumbPlaceholder: {
      width: '100%',
      aspectRatio: 1.5,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderGlyph: {
      fontSize: 24,
    },
    body: {
      paddingHorizontal: 11,
      paddingTop: 10,
      paddingBottom: 12,
    },
    title: {
      lineHeight: 19,
    },
    tagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 9,
    },
    // 분류색 점 — 8x8 사각(라운드 0). 흰 분류가 카드에 묻히지 않게 1px 보더.
    colorDot: {
      width: 8,
      height: 8,
      marginRight: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    tag: {
      flexShrink: 1,
      letterSpacing: 0.8,
    },
    date: {
      marginTop: 5,
    },
    // 공지 칩 + 태그 줄을 한 행에 — 공지 먼저, 태그가 남는 폭을 truncate로 채운다.
    tagLineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      gap: 6,
    },
    noticeChip: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    tagLine: {
      flexShrink: 1,
    },
  });
