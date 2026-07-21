import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import {
  Linking,
  Platform,
  StyleProp,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Eye, Megaphone } from 'lucide-react-native';
import { Message, MessageLink } from '../api';
import { Segment, splitSegments } from '../message-segments';
import { formatTime } from '../time';
import { hexAlpha, makePuffy, PuffyColors, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { LinkCard } from './LinkCard';
import { Text } from './Text';

interface Props {
  message: Message;
  /** "전체" 방에서 분류된 메시지의 말풍선 안 상단에 다는 분류 이름(태그로 렌더). */
  friendLabel?: string | null;
  /** 이 메시지가 속한 분류의 색(hex). 있으면 말풍선을 그 색으로 물들인다.
   *  없으면(미분류·색 없는 분류) 테마 기본 회색 파스텔. */
  bubbleColor?: string | null;
  /** 이 메시지에 붙은 태그 이름들. 말풍선 아래 #태그명 micro 모노로 나열(1줄 truncate). */
  tagNames?: string[] | null;
  onLongPress: (message: Message) => void;
  /** ⋮ 버튼을 눌렀을 때 (없으면 버튼 숨김) */
  onPressMenu?: (message: Message) => void;
  /** 말풍선 하단 상세보기 아이콘 탭 (없으면 버튼 숨김) — ChatScreen의 openMessageDetail 경로 재사용. */
  onDetail?: () => void;
}

export function MessageBubble({
  message,
  friendLabel,
  bubbleColor,
  tagNames,
  onLongPress,
  onPressMenu,
  onDetail,
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
  // 서버가 준 링크 배열(등장 순서·중복 제거). 있으면 본문을 세그먼트로 교차 렌더한다.
  // 없거나 빈 배열이면(구 메시지·단일 링크 폴백) 아래 messageLink 단일 카드로 렌더(무회귀).
  const hasSegments = Array.isArray(message.links) && message.links.length > 0;
  const segments = useMemo(
    () =>
      hasSegments ? splitSegments(message.content, message.links as MessageLink[]) : [],
    [hasSegments, message.content, message.links],
  );

  // 링크만 달랑 보낸 경우(단일 카드 폴백) 말풍선에 URL 원문을 반복해서 보여주지 않는다.
  const textBesidesUrl =
    isLink && message.url
      ? message.content.replace(message.url, '').trim()
      : message.content;

  // 분류 태그(전체 방의 분류된 메시지만): 말풍선 안 최상단에 micro 한 줄.
  // 색은 onBubble에 투명도를 얹어 본문과 위계를 준다. 긴 분류명은 truncate(줄바꿈 금지).
  const categoryTag = friendLabel
    ? t('chat.categoryTag', { name: friendLabel })
    : null;

  // 말풍선 안 최상단 줄: [📢(아이콘만)] + [분류 태그] 나란히(둘 다 없으면 줄 자체가 없음).
  // 공지는 텍스트 라벨 없이 아이콘 단독 — 의미는 accessibilityLabel로 전달.
  // 색은 onBubble 70% 알파라 분류색·기본 회색 퍼피 어디서든 자동으로 대비가 맞는다.
  const renderTopRow = (wrapperStyle: StyleProp<ViewStyle>) =>
    message.isNotice || categoryTag ? (
      <View style={wrapperStyle}>
        {message.isNotice ? (
          <View accessible accessibilityLabel={t('chat.noticeTag')}>
            <Megaphone size={12} strokeWidth={2} color={hexAlpha(puffy.onBubble, 0.7)} />
          </View>
        ) : null}
        {categoryTag ? (
          <Text
            variant="micro"
            color={hexAlpha(puffy.onBubble, 0.7)}
            numberOfLines={1}
            style={styles.topRowCategory}
          >
            {categoryTag}
          </Text>
        ) : null}
      </View>
    ) : null;

  // 그 아래 줄: #태그 #태그(있을 때만), 1줄 truncate. 같은 micro 모노·onBubble 70% 알파.
  const renderTagLine = (wrapperStyle: StyleProp<ViewStyle>) =>
    tagNames && tagNames.length ? (
      <Text
        variant="micro"
        color={hexAlpha(puffy.onBubble, 0.7)}
        style={wrapperStyle}
        numberOfLines={1}
      >
        {t('chat.tagsTag', { names: tagNames.map((n) => `#${n}`).join(' ') })}
      </Text>
    ) : null;

  // 단일 카드 폴백(구 메시지·links 없음)용 링크 데이터 — 레거시 단일 필드로 MessageLink를 구성.
  const messageLink: MessageLink = {
    url: message.url ?? '',
    ogTitle: message.ogTitle,
    ogDescription: message.ogDescription,
    ogImage: message.ogImage,
    siteName: message.siteName,
    linkType: message.linkType ?? null,
    linkMeta: message.linkMeta ?? null,
  };

  // 단일 카드 폴백: 탭하면 원본 URL을 연다(장소도 시트 단계 없이 바로 열기).
  const handleLinkPress = () => {
    if (message.url) Linking.openURL(message.url);
  };

  // 아이콘 색: 분류색 말풍선 위에서도 대비를 유지하도록 onBubble 계열 알파만 얹는다.
  const actionIconColor = hexAlpha(puffy.onBubble, 0.75);

  // 말풍선 안 맨 아래 우측 정렬 아이콘 액션 줄: 상세보기·삭제만(사용자 확정 —
  // 복사·공유는 ⋮ 메뉴 담당).
  const renderActionRow = (wrapperStyle: StyleProp<ViewStyle>) => (
    <View style={[styles.actionRow, wrapperStyle]}>
      {onDetail ? (
        <TouchableOpacity
          onPress={onDetail}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('chat.menu.detail')}
          style={styles.actionButton}
        >
          <Eye size={15} strokeWidth={2} color={actionIconColor} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  // 세그먼트 하나 렌더: 텍스트(본문 스타일·공백뿐이면 생략) 또는 카드(자기 URL로 링크).
  const renderSegment = (seg: Segment, i: number) => {
    if (seg.type === 'text') {
      const value = seg.value.trim();
      if (!value) return null;
      return (
        <Text
          key={`seg-t-${i}`}
          variant="body"
          color={puffy.onBubble}
          style={styles.segmentText}
          selectable={Platform.OS === 'web'}
        >
          {value}
        </Text>
      );
    }
    return (
      <TouchableOpacity
        key={`seg-c-${i}`}
        activeOpacity={0.85}
        onPress={() => Linking.openURL(seg.link.url)}
        onLongPress={() => onLongPress(message)}
        accessibilityRole="link"
      >
        <LinkCard link={seg.link} />
      </TouchableOpacity>
    );
  };

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
        // 세그먼트 모드는 카드마다 자기 URL을 열어야 하므로 바깥 프레임은 링크가 아니다(안쪽 카드가 담당).
        onPress={isLink && !hasSegments ? handleLinkPress : undefined}
        style={[
          styles.bubble,
          isLink && styles.linkBubbleWidth,
          // 클릭 대상이 아닌 프레임(텍스트·세그먼트 프레임)은 pointer 커서를 끈다.
          (!isLink || hasSegments) && styles.textCursor,
        ]}
        // 단일 카드 폴백만 프레임 자체가 원본 URL을 여는 링크.
        accessibilityRole={isLink && !hasSegments ? 'link' : undefined}
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
            {renderTopRow(styles.linkTopRow)}
            {renderTagLine(styles.linkTagLine)}
            {hasSegments ? (
              // 세그먼트 교차 렌더: [텍스트][카드][텍스트][카드]… 입력 순서 그대로.
              <View style={styles.segments}>{segments.map(renderSegment)}</View>
            ) : (
              // 단일 카드 폴백(구 메시지·links 없음) — 텍스트는 카드 안 코멘트로.
              <LinkCard link={messageLink} comment={textBesidesUrl} />
            )}
            {renderActionRow(styles.linkActionRow)}
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
            {renderTopRow(styles.textTopRow)}
            {renderTagLine(styles.textTagLine)}
            <Text
              variant="body"
              color={puffy.onBubble}
              style={styles.text}
              // 데스크톱에서 드래그로 복사 가능 (네이티브는 long-press 메뉴와 충돌해 제외)
              selectable={Platform.OS === 'web'}
            >
              {message.content}
            </Text>
            {renderActionRow(styles.textActionRow)}
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
  // 분류명 — 긴 이름은 줄바꿈 없이 truncate.
  topRowCategory: {
    flexShrink: 1,
  },
  // 텍스트 말풍선의 최상단 줄(공지+분류) — 프레임 자체 패딩(15) 안에서.
  textTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  // 텍스트 말풍선의 #태그 줄 — 본문 위, 1줄 truncate.
  textTagLine: {
    marginBottom: 5,
  },
  // 링크 프레임의 최상단 줄 — 프레임 패딩(5)이 작아 카드 가장자리와 거리를 두려고 추가 패딩.
  linkTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingTop: 3,
    marginBottom: 3,
  },
  // 링크 프레임의 #태그 줄 — 흰 카드 위, 1줄 truncate.
  linkTagLine: {
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  // 세그먼트 교차 렌더 컨테이너 — 텍스트/카드 사이 간격.
  segments: {
    gap: 6,
    paddingVertical: 2,
  },
  // 세그먼트 텍스트 — 카드 밖 본문. 프레임 2px 보더에서 살짝 들여 카드 코멘트(14)와 결 맞춤.
  segmentText: {
    paddingHorizontal: 9,
    lineHeight: 21,
  },
  // 말풍선 안 맨 아래 아이콘 액션 줄(상세보기·복사·공유·삭제) — 우측 정렬.
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 14,
  },
  actionButton: {
    padding: 2,
  },
  // 텍스트 말풍선: 본문 아래 살짝 띄운다.
  textActionRow: {
    marginTop: 4,
  },
  // 링크 프레임: 카드 아래, 좌우로는 카드와 맞춰 살짝 들여쓴다.
  linkActionRow: {
    paddingHorizontal: 8,
    marginTop: 4,
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
  text: {
    lineHeight: 21,
  },
  // 분류된 링크의 퍼피 프레임 — puffyBubble 재질을 쓰되 패딩만 작게(카드 주위로 분류색이
  // 살짝 보이는 프레임). 폭 캡은 바깥 TouchableOpacity(linkBubbleWidth 76%+460)가 담당.
  linkFrame: {
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 5,
  },
});
