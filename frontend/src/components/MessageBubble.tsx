import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Message } from '../api';
import { formatTime } from '../time';
import { colors } from '../theme';

interface Props {
  message: Message;
  /** "나에게" 방에서 분류된 메시지 위에 보여줄 친구 이름 */
  friendLabel?: string | null;
  onLongPress: (message: Message) => void;
  /** ⋮ 버튼을 눌렀을 때 (없으면 버튼 숨김) */
  onPressMenu?: (message: Message) => void;
}

export function MessageBubble({
  message,
  friendLabel,
  onLongPress,
  onPressMenu,
}: Props) {
  const isLink = message.kind === 'link' && message.url;
  // 링크만 달랑 보낸 경우 말풍선에 URL 원문을 반복해서 보여주지 않는다.
  const textBesidesUrl =
    isLink && message.url
      ? message.content.replace(message.url, '').trim()
      : message.content;

  return (
    <View style={styles.wrap}>
      {friendLabel ? <Text style={styles.friendLabel}>{friendLabel}</Text> : null}
      <View style={styles.row}>
        {onPressMenu ? (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => onPressMenu(message)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialCommunityIcons
              name="dots-vertical"
              size={16}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
        ) : null}
        <Text style={styles.time}>{formatTime(message.createdAt)}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress(message)}
        onPress={isLink ? () => Linking.openURL(message.url!) : undefined}
        style={[styles.bubble, isLink && styles.linkBubble]}
      >
        {isLink ? (
          <View>
            {textBesidesUrl ? (
              <Text style={styles.linkComment}>{textBesidesUrl}</Text>
            ) : null}
            {message.ogImage ? (
              <Image
                source={{ uri: message.ogImage }}
                style={styles.thumbnail}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.linkBody}>
              <Text style={styles.linkTitle} numberOfLines={2}>
                {message.ogTitle ?? message.url}
              </Text>
              {message.ogDescription ? (
                <Text style={styles.linkDescription} numberOfLines={2}>
                  {message.ogDescription}
                </Text>
              ) : null}
              <Text style={styles.linkSite} numberOfLines={1}>
                {message.siteName ?? message.url}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.text}>{message.content}</Text>
        )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 3,
  },
  friendLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textTertiary,
    textAlign: 'right',
    paddingHorizontal: 18,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  menuButton: {
    marginRight: 5,
    marginBottom: 1,
  },
  time: {
    fontSize: 10,
    color: colors.textTertiary,
    marginRight: 8,
    marginBottom: 3,
  },
  // 내 말풍선: 검정 채움 + 흰 글자
  bubble: {
    maxWidth: '76%',
    backgroundColor: colors.ink,
    borderRadius: 18,
    borderTopRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  // 링크 미리보기: 흰 카드 + 헤어라인
  linkBubble: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: 0,
    overflow: 'hidden',
    width: '76%',
  },
  text: {
    fontSize: 15,
    color: colors.inverse,
    lineHeight: 21,
  },
  linkComment: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  thumbnail: {
    width: '100%',
    height: 156,
    backgroundColor: colors.surface,
  },
  linkBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 19,
  },
  linkDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  linkSite: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 8,
  },
});
