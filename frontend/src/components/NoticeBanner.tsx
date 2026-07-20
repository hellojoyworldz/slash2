import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Megaphone, X } from 'lucide-react-native';
import { Message } from '../api';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Text } from './Text';

interface Props {
  message: Message;
  /** 배너 탭 — 링크면 원본 열기(호출부가 처리). */
  onPress: () => void;
  /** X — 공지 해제(확인창은 호출부에서). */
  onDismiss: () => void;
}

// 채팅방 상단 공지 배너: [Megaphone][공지 내용 한 줄 truncate][X 해제].
// 헤더 아래 1px hairline 박스(surface 채움). 링크면 ogTitle??url, 메모면 content를 보여준다.
export function NoticeBanner({ message, onPress, onDismiss }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const isLink = message.kind === 'link' && !!message.url;
  const text = isLink ? message.ogTitle ?? message.url ?? '' : message.content;

  return (
    <View style={styles.banner}>
      <Pressable
        style={styles.main}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={text}
      >
        <Megaphone size={16} strokeWidth={2} color={colors.textSecondary} style={styles.icon} />
        <Text
          variant="label"
          color={colors.textPrimary}
          style={styles.text}
          numberOfLines={1}
        >
          {text}
        </Text>
      </Pressable>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('chat.noticeBanner.dismiss')}
      >
        <X size={16} strokeWidth={2} color={colors.textTertiary} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // 헤더 아래 1px hairline 박스(surface 채움·라운드 0·그림자 없음).
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 10,
    },
    icon: {
      marginRight: 8,
    },
    text: {
      flexShrink: 1,
    },
  });
