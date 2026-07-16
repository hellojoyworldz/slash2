import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Image,
  Linking,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Message } from '../api';
import { formatTime } from '../time';
import { hexAlpha, makePuffy, PuffyColors, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { BrutalFrame } from './Brutal';
import { Text } from './Text';

interface Props {
  message: Message;
  /** "전체" 방에서 분류된 메시지의 말풍선 안 상단에 다는 분류 이름(태그로 렌더). */
  friendLabel?: string | null;
  /** 이 메시지가 속한 분류의 색(hex). 있으면 말풍선을 그 색으로 물들인다.
   *  없으면(미분류·색 없는 분류) 테마 기본 회색 파스텔. */
  bubbleColor?: string | null;
  onLongPress: (message: Message) => void;
  /** ⋮ 버튼을 눌렀을 때 (없으면 버튼 숨김) */
  onPressMenu?: (message: Message) => void;
}

export function MessageBubble({
  message,
  friendLabel,
  bubbleColor,
  onLongPress,
  onPressMenu,
}: Props) {
  const { t } = useTranslation();
  const { colors, resolvedScheme } = useTheme();
  // 폭 규칙은 "컨테이너 비례(%) + 절대 상한" — 창 폭이 아니라 담긴 패널을 따라
  // 반응하고(스플리터 포함), 아주 넓어지면 캡에서 멈춘다.
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 이 말풍선의 puffy 세트: 분류색이 있으면 그 색에서 파생, 없으면 테마 기본.
  // 다크에서도 makePuffy의 L28 채도 클램프가 그대로 적용돼 onBubble 대비 유지.
  const puffy: PuffyColors = useMemo(
    () =>
      bubbleColor
        ? makePuffy(resolvedScheme, bubbleColor)
        : {
            bubbleFill: colors.bubbleFill,
            bubbleBorder: colors.bubbleBorder,
            bubbleShade: colors.bubbleShade,
            bubbleHighlight: colors.bubbleHighlight,
            onBubble: colors.onBubble,
          },
    [
      bubbleColor,
      resolvedScheme,
      colors.bubbleFill,
      colors.bubbleBorder,
      colors.bubbleShade,
      colors.bubbleHighlight,
      colors.onBubble,
    ],
  );
  // 푹신한(puffy) 말풍선: 파스텔 채움 + 틴트 테두리 위에
  // 인셋 하이라이트(윗면 볼록)·인셋 그늘(아랫면 쿠션)을 그라디언트로 재현.
  // (RN엔 inset box-shadow가 없어 3플랫폼 공통으로 이렇게 그린다)
  const insetTop = useMemo(
    () => [puffy.bubbleHighlight, 'rgba(255,255,255,0)'] as const,
    [puffy.bubbleHighlight],
  );
  const insetBottom = useMemo(
    () =>
      [hexAlpha(puffy.bubbleShade, 0), hexAlpha(puffy.bubbleShade, 0.7)] as const,
    [puffy.bubbleShade],
  );
  const isLink = message.kind === 'link' && message.url;
  // 링크만 달랑 보낸 경우 말풍선에 URL 원문을 반복해서 보여주지 않는다.
  const textBesidesUrl =
    isLink && message.url
      ? message.content.replace(message.url, '').trim()
      : message.content;

  // 분류 태그(전체 방의 분류된 메시지만): 말풍선 안 최상단에 micro 한 줄.
  // 색은 onBubble에 투명도를 얹어 본문과 위계를 준다. 긴 분류명은 truncate(줄바꿈 금지).
  const categoryTag = friendLabel
    ? t('chat.categoryTag', { name: friendLabel })
    : null;

  // 흰 OG 카드(썸네일·타이틀·설명·사이트). 분류 태그는 이 카드 밖(퍼피 밴드)에 둔다.
  const linkCard = (
    <BrutalFrame contentStyle={styles.linkInner}>
      {textBesidesUrl ? (
        <Text variant="body" style={styles.linkComment}>
          {textBesidesUrl}
        </Text>
      ) : null}
      {message.ogImage ? (
        <Image
          source={{ uri: message.ogImage }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.linkBody}>
        <Text variant="bodyStrong" style={styles.linkTitle} numberOfLines={2}>
          {message.ogTitle ?? message.url}
        </Text>
        {message.ogDescription ? (
          <Text
            variant="caption"
            color={colors.textSecondary}
            style={styles.linkDescription}
            numberOfLines={2}
          >
            {message.ogDescription}
          </Text>
        ) : null}
        <Text
          variant="micro"
          color={colors.textTertiary}
          style={styles.linkSite}
          numberOfLines={1}
        >
          {message.siteName ?? message.url}
        </Text>
      </View>
    </BrutalFrame>
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {onPressMenu ? (
          <TouchableOpacity
            style={styles.menuButton}
            onPress={() => onPressMenu(message)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.messageMenu')}
          >
            <MaterialCommunityIcons
              name="dots-vertical"
              size={16}
              color={colors.textTertiary}
            />
          </TouchableOpacity>
        ) : null}
        <Text variant="micro" color={colors.textTertiary} style={styles.time}>
          {formatTime(message.createdAt)}
        </Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onLongPress={() => onLongPress(message)}
        onPress={isLink ? () => Linking.openURL(message.url!) : undefined}
        style={[
          styles.bubble,
          isLink && styles.linkBubbleWidth,
          // 텍스트 말풍선은 클릭 대상이 아니므로 pointer 커서를 끈다 (링크 카드만 pointer)
          !isLink && styles.textCursor,
        ]}
        accessibilityRole={isLink ? 'link' : undefined}
      >
        {isLink ? (
          // 링크 말풍선: 텍스트 말풍선과 동일한 퍼피 재질(bubbleFill·bubbleBorder·라운드 24·
          // 인셋 밴드·틴트 섀도) 프레임 안에 [분류 태그(있을 때만)] + [흰 OG 카드].
          // 태그가 있으면 흰 카드가 아니라 분류색 위에 앉는다. 미분류면 기본/selfColor 파생
          // 퍼피(텍스트 말풍선과 동일)라 재질이 통일된다.
          <View
            style={[
              styles.puffyBubble,
              styles.linkFrame,
              {
                backgroundColor: puffy.bubbleFill,
                borderColor: puffy.bubbleBorder,
                shadowColor: puffy.bubbleShade,
              },
            ]}
          >
            {/* 인셋 하이라이트·그늘 — 텍스트 말풍선과 동일 (태그 밴드/프레임 여백에 보인다) */}
            <LinearGradient
              pointerEvents="none"
              colors={insetTop}
              style={styles.insetTop}
            />
            <LinearGradient
              pointerEvents="none"
              colors={insetBottom}
              style={styles.insetBottom}
            />
            {categoryTag ? (
              <Text
                variant="micro"
                color={hexAlpha(puffy.onBubble, 0.7)}
                style={styles.linkFrameTag}
                numberOfLines={1}
              >
                {categoryTag}
              </Text>
            ) : null}
            {linkCard}
          </View>
        ) : (
          <View
            style={[
              styles.puffyBubble,
              styles.textFrameCap,
              {
                backgroundColor: puffy.bubbleFill,
                borderColor: puffy.bubbleBorder,
                shadowColor: puffy.bubbleShade,
              },
            ]}
          >
            {/* 인셋 하이라이트: 윗변을 감싸는 빛 (볼록) */}
            <LinearGradient
              pointerEvents="none"
              colors={insetTop}
              style={styles.insetTop}
            />
            {/* 인셋 그늘: 아랫변 쿠션 눌림 */}
            <LinearGradient
              pointerEvents="none"
              colors={insetBottom}
              style={styles.insetBottom}
            />
            {categoryTag ? (
              <Text
                variant="micro"
                color={hexAlpha(puffy.onBubble, 0.7)}
                style={styles.bubbleTag}
                numberOfLines={1}
              >
                {categoryTag}
              </Text>
            ) : null}
            <Text
              variant="body"
              color={puffy.onBubble}
              style={styles.text}
              // 데스크톱에서 드래그로 복사 가능 (네이티브는 long-press 메뉴와 충돌해 제외)
              selectable={Platform.OS === 'web'}
            >
              {message.content}
            </Text>
          </View>
        )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  wrap: {
    marginVertical: 3,
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
    marginRight: 8,
    marginBottom: 3,
  },
  // 말풍선 폭 캡 (재질은 BrutalFrame이 담당)
  // 컨테이너(패널)의 76%를 따라가되, 아무리 넓어도 캡에서 멈춤
  bubble: {
    maxWidth: '76%',
  },
  linkBubbleWidth: {
    width: '76%',
    maxWidth: 460,
  },
  // 텍스트 말풍선 절대 상한 (76% 안에서 추가로)
  textFrameCap: {
    maxWidth: 520,
  },
  // 일반 텍스트 말풍선: pointer 대신 기본 커서 (웹)
  textCursor: {
    cursor: 'auto',
  },
  // 푹신한 말풍선 — 한 뷰에 통합 (iOS 그림자는 배경 있는 뷰에만 그려진다):
  // 파스텔 채움 + 2px 틴트 테두리 + 라운드 24 (말풍선 전용 예외) + 틴트 그림자.
  // 색(채움·테두리·그림자색)은 분류색에서 파생돼 인라인으로 주입된다.
  puffyBubble: {
    borderWidth: 2,
    borderRadius: 24,
    overflow: 'hidden',
    paddingHorizontal: 15,
    paddingVertical: 10,
    shadowOpacity: 0.55,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  // 레퍼런스 CSS의 inset 0 3px 5px — 윗변에 붙는 얇고 강한 빛띠
  insetTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 12,
  },
  // inset 0 -4px 6px — 아랫변에 붙는 그늘띠
  insetBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 14,
  },
  // 링크 카드 안쪽: 배경색 + 클리핑 (썸네일이 보더 안에 들어가게)
  // 라운드는 말풍선(24)과 결 맞추되 큰 면이라 한 단계 낮게
  linkInner: {
    backgroundColor: colors.background,
    overflow: 'hidden',
    borderRadius: 18,
  },
  text: {
    lineHeight: 21,
  },
  // 분류 태그 — 텍스트 말풍선 안 최상단(본문 위 한 줄).
  bubbleTag: {
    marginBottom: 5,
  },
  // 분류된 링크의 퍼피 프레임 — puffyBubble 재질을 쓰되 패딩만 작게(카드 주위로 분류색이
  // 살짝 보이는 프레임). 폭 캡은 바깥 TouchableOpacity(linkBubbleWidth 76%+460)가 담당.
  linkFrame: {
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 5,
  },
  // 분류 태그 — 퍼피 프레임 상단 밴드(분류색 위). 흰 카드 밖.
  linkFrameTag: {
    paddingHorizontal: 8,
    paddingTop: 3,
    paddingBottom: 8,
  },
  linkComment: {
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
  },
  // 고정 높이 대신 OG 표준 비율(1.91:1) — 카드 폭이 변해도 비율 유지
  thumbnail: {
    width: '100%',
    aspectRatio: 1.91,
    backgroundColor: colors.surface,
  },
  linkBody: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  linkTitle: {
    lineHeight: 19,
  },
  linkDescription: {
    marginTop: 4,
    lineHeight: 17,
  },
  linkSite: {
    marginTop: 8,
  },
});
