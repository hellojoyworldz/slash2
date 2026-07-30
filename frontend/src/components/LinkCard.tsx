import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ExternalLink,
  Link as LinkIcon,
  MapPin,
  Maximize2,
  Phone,
  Play,
  ShoppingBag,
  X,
} from 'lucide-react-native';
import { LinkType, MessageLink } from '../api';
import {
  EMBED_PROVIDER_LABEL,
  EmbedInfo,
  getEmbedInfo,
  youtubeThumbnailUrl,
} from '../link-embed';
import { rowFill } from '../row-hover';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { BrutalFrame } from './Brutal';
import { EmbedFrame } from './EmbedFrame';
import { LinkDataRow } from './LinkDataRow';
import { RemoteImage } from './RemoteImage';
import { Text } from './Text';

// 자동구분 종류 → 출처 행 꼬리표(대문자 모노 글리프). 미분류는 LINK.
const TAG_BY_TYPE: Record<LinkType, string> = {
  place: 'PLACE',
  video: 'VIDEO',
  item: 'ITEM',
};

// 꼬리표 아이콘 — 자동구분 화면(AutoScreen의 AUTO_ICONS)과 같은 아이콘을 써서
// 채팅 카드와 자동구분 탭이 같은 시각 언어를 공유한다. 미분류는 LINK 아이콘.
const ICON_BY_TYPE: Record<LinkType, typeof MapPin> = {
  place: MapPin,
  video: Play,
  item: ShoppingBag,
};

// 장소 흑백 정적지도 썸네일용 구글 키. 없으면 ogImage로 폴백한다.
const GMAPS_KEY = process.env.EXPO_PUBLIC_GMAPS_STATIC_KEY;

// 이미지 위 오버레이(플레이·펼치기·닫기 칩) 공통 색 — 테마와 무관한 고정 검정 스크림 + 흰 글리프.
// 영상 길이 배지와 같은 재질이라 카드 안 오버레이 언어가 하나로 통일된다.
const OVERLAY_SCRIM = 'rgba(0,0,0,0.78)';
const OVERLAY_INK = '#FFFFFF';

// 미디어 프레임 스타일 — 썸네일 래퍼(thumbWrap)·임베드 래퍼(embedWrap)에 그대로 얹는다.
// 안의 이미지/EmbedFrame은 항상 이 래퍼를 꽉 채우기만 해서, 오버레이 칩·길이 배지·닫기 버튼
// 같은 절대위치 장식이 실제 콘텐츠 경계와 어긋나지 않는다.
type MediaFrame = Pick<ViewStyle, 'width' | 'maxWidth' | 'aspectRatio' | 'height' | 'alignSelf'>;

// 세로(쇼츠) 공통 높이 캡 — 접힘 썸네일과 펼침 임베드가 항상 같은
// 크기를 써서 재생/펼치기 순간 카드 높이가 점프하지 않는다.
const VERTICAL_FRAME_HEIGHT = 460;
// 인스타 임베드 초기 높이 — 임베드가 실제 높이(MEASURE)를 알려줄 때까지의 폴백일 뿐이고,
// 도착하면 카드가 콘텐츠 높이로 늘어나 내부 스크롤 없이 전부 보인다.
const IG_EMBED_HEIGHT = 640;

// 실측 높이 캐시(url → px). 리스트가 스크롤로 카드를 재활용하면 state가 리셋돼
// "폴백 640 → 실측"으로 높이가 또 바뀌고, 그 순간 스크롤 위치가 위아래로 튄다.
// 한 번 잰 높이를 세션 동안 기억해 재마운트 때 처음부터 맞는 높이로 그린다.
const IG_HEIGHT_CACHE = new Map<string, number>();

// 세로(폭 < 높이) 프레임 — 높이 460을 기준으로 폭을 역산해 카드 안 가운데 정렬한다. 카드가
// 좁으면 maxWidth:'100%'가 폭을 줄이고 aspectRatio가 높이를 비례해서 따라 줄인다(레이아웃
// 엔진이 width/maxWidth/aspectRatio를 CSS와 동일하게 해석하므로, 결과는 항상
// min(카드폭, 460×비율) 기준 비율 유지와 같다 — 별도 측정 로직이 필요 없다).
function verticalFrame(aspect: number): MediaFrame {
  return {
    width: VERTICAL_FRAME_HEIGHT * aspect,
    maxWidth: '100%',
    aspectRatio: aspect,
    alignSelf: 'center',
  };
}

// 가로/정방형(비율 ≥ 1) 프레임 — 카드 전체 폭 기준(카드 자체가 460 캡을 가지므로 높이가
// 460을 넘지 않는다).
function horizontalFrame(aspect: number): MediaFrame {
  return { width: '100%', aspectRatio: aspect };
}

// 미디어 프레임 결정 — 콘텐츠 종류별 실제 비율을 처음부터 반영한다.
// 인스타는 썸네일 단계 없이 항상 임베드(프로필·캡션 포함)를 바로 그리므로 여기 안 온다.
// X는 원래도 접힘(1.91)과 펼침(높이 380 고정)이 서로 달랐고, 피드백 대상이 아니라 손대지 않는다.
function mediaFrame(embed: EmbedInfo | null, expanded: boolean): MediaFrame {
  if (embed?.provider === 'youtube') {
    return embed.vertical ? verticalFrame(9 / 16) : horizontalFrame(16 / 9);
  }
  if (embed?.provider === 'x') {
    // X는 본문 + 미디어라 넘치는 만큼 임베드 내부 스크롤로 본다(기존 동작 유지).
    return expanded ? { width: '100%', height: 380 } : horizontalFrame(1.91);
  }
  // 임베드 불가 일반 링크 — 기존 OG 표준 비율.
  return horizontalFrame(1.91);
}

// 가격 표기: 기본 통화 KRW(₩), 그 외는 통화코드 + 금액. 천단위 구분은 Intl(실패 시 원값 폴백).
function formatPrice(price: number, currency?: string): string {
  const cur = currency ?? 'KRW';
  let num: string;
  try {
    num = new Intl.NumberFormat('ko-KR').format(price);
  } catch {
    num = String(price);
  }
  return cur === 'KRW' ? `₩${num}` : `${cur} ${num}`;
}

// 영상 길이: 1시간 미만 m:ss, 이상 h:mm:ss.
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// 잘 알려진 서비스의 출처(siteName) 표시명 정규화 — 페이지가 영문 og:site_name을 줘도
// 로케일 표기로 통일한다 (예: "Google Maps" → ko "구글지도"). 그 외엔 원값 그대로.
function displaySiteName(link: MessageLink, t: (key: string) => string): string {
  const raw = link.siteName ?? link.url;
  if (/^google maps$/i.test(raw.trim())) return t('sites.googleMaps');
  return raw;
}

interface Props {
  /** 이 카드가 그릴 링크. 자기 og/linkType/linkMeta로 렌더한다. */
  link: MessageLink;
  /** 카드 안 상단 코멘트(단일 카드 폴백 전용 — 세그먼트 모드는 텍스트가 카드 밖 세그먼트로 나온다). */
  comment?: string | null;
  /** 카드 롱프레스(메시지 액션 메뉴). 카드가 자기 탭을 소유하므로 호출부는 이걸로 넘긴다. */
  onLongPress?: () => void;
}

// 흰 OG 카드 — 3개 존: [코멘트][존1 미디어][존2 텍스트: 타이틀·캡션·데이터 행·출처 행][존3 바로가기].
// MessageBubble(말풍선 세그먼트·단일 폴백)·MessageDetail(상세 모달) 공용 — 렌더 중복 구현 금지.
//
// 탭/롱프레스 규칙(카드가 소유한다 — 호출부에서 Linking.openURL로 감싸지 말 것):
//  · 존1(미디어)만 Pressable이다. 임베드 가능(유튜브·인스타·X): 탭 = 카드 안에서 펼치기/접기
//    (유튜브는 곧 재생). 그 외: 탭 = 원본 URL 열기(기존 동작). onLongPress(메시지 액션 메뉴)도 존1에만 붙는다.
//  · 존2(텍스트)는 탭 동작이 없는 순수 표시 영역이다 — 바로가기 버튼이 따로 있으니 텍스트가
//    인터랙티브할 이유가 없고, 웹에서 제목·설명·데이터행 값을 드래그 선택·복사할 수 있어야 한다.
//  · 외부 이동은 어느 카드에서든 맨 아래 존3 "바로가기" 행이 담당한다.
export function LinkCard({ link, comment, onLongPress }: Props) {
  const { t } = useTranslation();
  const { colors, resolvedScheme } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // 임베드 정보는 URL 파싱만으로 계산(백엔드·API 키 없음). X는 앱 테마를 그대로 따른다.
  const embed = useMemo(
    () => getEmbedInfo(link.url, resolvedScheme),
    [link.url, resolvedScheme],
  );
  const [expanded, setExpanded] = useState(false);
  // 인스타 임베드가 알려준 실제 콘텐츠 높이 — 도착하면 프레임을 그 높이로 늘려
  // 내부 스크롤 없이 전부 보인다(도착 전엔 캐시 → 없으면 IG_EMBED_HEIGHT 폴백).
  const [igHeight, setIgHeight] = useState<number | null>(
    () => IG_HEIGHT_CACHE.get(link.url) ?? null,
  );
  // 리스트 재사용으로 같은 카드 인스턴스가 다른 링크를 그리게 되면 펼침·실측 높이를 리셋한다
  // (실측 높이는 캐시에 있으면 그 값으로 — 재마운트 때 높이 점프 방지).
  useEffect(() => {
    setExpanded(false);
    setIgHeight(IG_HEIGHT_CACHE.get(link.url) ?? null);
  }, [link.url]);
  const handleIgHeight = useCallback(
    (h: number) => {
      const v = Math.ceil(h);
      IG_HEIGHT_CACHE.set(link.url, v);
      setIgHeight(v);
    },
    [link.url],
  );
  // 인스타는 접힘/펼침 단계 없이 처음부터 공식 임베드(프로필 헤더·사진·캡션)를 그대로 그린다.
  const alwaysEmbed = embed?.provider === 'instagram';

  const lt = link.linkType ?? null;
  const m = link.linkMeta ?? null;
  const isPlace = lt === 'place';
  const isVideo = lt === 'video';
  const isItem = lt === 'item';
  const tag = (lt && TAG_BY_TYPE[lt]) || 'LINK';
  const TagIcon = (lt && ICON_BY_TYPE[lt]) || LinkIcon;
  // 캡션: 장소는 설명 대신 주소를, 그 외는 ogDescription.
  const captionText = isPlace ? m?.address ?? null : link.ogDescription;
  // 썸네일: 장소는 (키+좌표) 흑백 정적지도 → 없으면 ogImage → 유튜브는 공개 CDN 폴백 → 셋 다 없으면 생략.
  const staticMapUrl =
    isPlace && m?.lat != null && m?.lng != null && GMAPS_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${m.lat},${m.lng}&zoom=16&size=460x240&scale=2&style=saturation:-100&markers=color:0xEBADC4%7C${m.lat},${m.lng}&key=${GMAPS_KEY}`
      : null;
  const thumbUri =
    staticMapUrl ??
    link.ogImage ??
    (embed?.provider === 'youtube' && embed.videoId
      ? youtubeThumbnailUrl(embed.videoId)
      : null);
  // 제목: linkMeta.placeName(장소명, ogTitle이 "Google Maps" 같은 제네릭일 때 폴백) → ogTitle → url.
  const titleText = m?.placeName ?? link.ogTitle ?? link.url;
  // 데이터 행: linkMeta에 있는 값은 전부(없으면 그 행 생략). 장소는 영업·전화, 상품은 가격,
  // 영상은 채널·길이(썸네일 배지와 별개로 행에도 표시), 글은 작성자.
  const dataRows: { label: string; value: string; lines?: number }[] = [];
  // 영업시간은 시간대 그룹이 줄바꿈으로 들어온다("월 …\n화·목·금 …") — 줄 수 제한 없이
  // 그룹당 한 줄씩 그대로 떨어뜨린다(0 = 무제한).
  if (isPlace && m?.hours)
    dataRows.push({ label: t('chat.linkData.hours'), value: m.hours, lines: 0 });
  if (isPlace && m?.phone)
    dataRows.push({ label: t('chat.linkData.phone'), value: m.phone });
  if (isPlace && m?.reviews)
    dataRows.push({ label: t('chat.linkData.reviews'), value: m.reviews });
  if (isItem && m?.price != null)
    dataRows.push({
      label: t('chat.linkData.price'),
      value: formatPrice(m.price, m.currency),
    });
  if (isVideo && m?.channel)
    dataRows.push({ label: t('chat.linkData.channel'), value: m.channel });
  if (isVideo && m?.durationSec != null)
    dataRows.push({
      label: t('chat.linkData.duration'),
      value: formatDuration(m.durationSec),
    });
  // 미분류 링크(og:author가 있으면)에도 작성자 행을 노출한다(아티클 종류 제거 후 폴백).
  if (!isPlace && !isVideo && !isItem && m?.author)
    dataRows.push({ label: t('chat.linkData.author'), value: m.author });

  const openExternal = useCallback(() => {
    if (link.url) Linking.openURL(link.url);
  }, [link.url]);

  // 전화걸기 — tel: 스킴은 구분자 없는 숫자가 가장 호환이 좋다(+ 국가번호는 유지).
  const phone = m?.phone ?? null;
  const callPhone = useCallback(() => {
    if (phone) Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`);
  }, [phone]);

  // 임베드 가능하면 카드 안에서 펼치고/접고, 아니면 기존대로 원본을 연다.
  const handleContentPress = useCallback(() => {
    if (embed) setExpanded((v) => !v);
    else openExternal();
  }, [embed, openExternal]);

  const isPlayable = embed?.provider === 'youtube';
  // 본문 탭이 무슨 일을 하는지(스크린리더용 힌트). 접근명은 카드 안 제목·설명 텍스트가 그대로 맡는다.
  const contentHint = embed
    ? expanded
      ? t('a11y.embedCollapse')
      : isPlayable
        ? t('a11y.embedPlay')
        : t('a11y.embedExpand')
    : undefined;

  // 미디어 오버레이 칩 — 썸네일 위 중앙(재생/펼치기). 탭 대상은 바깥 Pressable이라 장식.
  const overlayGlyph = isPlayable ? (
    <Play size={20} strokeWidth={2} color={OVERLAY_INK} fill={OVERLAY_INK} />
  ) : (
    <Maximize2 size={18} strokeWidth={2} color={OVERLAY_INK} />
  );

  // 접힌 상태의 미디어 프레임 — 펼쳤을 때(mediaFrame(..., true))와 유튜브는 동일해서
  // 재생 순간 크기 점프가 없다(X는 원래도 다르다 — mediaFrame 주석 참조).
  const frame = mediaFrame(embed, false);

  // 접힌 상태의 미디어 영역: 썸네일(+임베드면 칩) → 썸네일이 없고 임베드면 프로바이더 자리 표시 → 없음.
  const mediaNode = thumbUri ? (
    <View style={[styles.thumbWrap, frame]}>
      <RemoteImage
        uri={thumbUri}
        style={styles.thumbnail}
        resizeMode="cover"
        // 장식 이미지 — 바로 아래 제목(linkTitle)이 이미 대체 텍스트 역할을 한다.
        accessible={false}
      />
      {embed ? (
        <View style={styles.overlayCenter} pointerEvents="none">
          <View style={styles.overlayChip}>{overlayGlyph}</View>
        </View>
      ) : null}
      {/* 영상 길이 배지 — durationSec 있을 때만, 썸네일 우하단. */}
      {isVideo && m?.durationSec != null ? (
        <View style={styles.durationBadge}>
          <Text variant="micro" color={OVERLAY_INK} style={styles.durationText}>
            {formatDuration(m.durationSec)}
          </Text>
        </View>
      ) : null}
    </View>
  ) : embed ? (
    // og:image가 없는 인스타/X — 여기 미디어가 있다는 걸 알리는 자리 표시(브랜드명은 번역 대상 아님).
    <View style={[styles.embedPlaceholder, frame]}>
      {isPlayable ? (
        <Play size={20} strokeWidth={2} color={colors.textTertiary} />
      ) : (
        <Maximize2 size={18} strokeWidth={2} color={colors.textTertiary} />
      )}
      <Text variant="micro" color={colors.textTertiary} style={styles.placeholderLabel}>
        {EMBED_PROVIDER_LABEL[embed.provider]}
      </Text>
    </View>
  ) : null;

  return (
    <BrutalFrame contentStyle={styles.linkInner}>
      {comment ? (
        <Text variant="body" style={styles.linkComment}>
          {comment}
        </Text>
      ) : null}
      {/* 존 1(미디어): 임베드가 펼쳐졌으면 플레이어/캐러셀 자체가 터치를 받는다(닫기는 별도 X 칩).
          접혔으면 썸네일/자리표시를 담은 탭 존 — 탭·롱프레스는 여기가 전담한다. 텍스트 존은
          탭 대상이 아니라서 밖으로 뺐다(문제 3: 텍스트 클릭이 재생을 토글하던 것 방지). */}
      {alwaysEmbed && embed ? (
        // 인스타: 접힘 단계 없이 공식 임베드를 즉시 렌더 — 사용자가 원한 "펼친 그 상태"가 기본.
        // 캐러셀 넘기기·프로필·캡션은 임베드가 자체 처리하고, 닫기 칩도 없다(돌아갈 썸네일이 없으니).
        <View style={[styles.embedWrap, { width: '100%', height: igHeight ?? IG_EMBED_HEIGHT }]}>
          <EmbedFrame
            uri={embed.embedUrl}
            accessibilityLabel={titleText}
            onContentHeight={handleIgHeight}
            scrollGuard
          />
        </View>
      ) : expanded && embed ? (
        // 펼친 임베드는 본문 Pressable 밖에 둔다 — 플레이어/캐러셀이 터치를 그대로 받아야 하고,
        // 웹에서도 인터랙티브 요소가 중첩되지 않는다(닫기 칩만 별도 버튼).
        <View style={[styles.embedWrap, mediaFrame(embed, true)]}>
          <EmbedFrame uri={embed.embedUrl} accessibilityLabel={titleText} />
          <Pressable
            onPress={() => setExpanded(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.embedCollapse')}
            style={styles.embedClose}
          >
            <X size={14} strokeWidth={2.5} color={OVERLAY_INK} />
          </Pressable>
        </View>
      ) : mediaNode ? (
        <Pressable
          onPress={handleContentPress}
          onLongPress={onLongPress}
          accessibilityRole={embed ? 'button' : 'link'}
          // 텍스트가 더 이상 Pressable 안에 없어 접근명을 자동으로 물려받지 못하므로 명시한다.
          accessibilityLabel={titleText}
          accessibilityHint={contentHint}
          accessibilityState={embed ? { expanded } : undefined}
          style={({ pressed }) => (pressed ? styles.mediaPressed : undefined)}
        >
          {mediaNode}
        </Pressable>
      ) : null}
      {/* 존 2(텍스트): 탭 동작 없는 순수 표시 영역 — 제목·설명·데이터행 값은 웹에서 드래그
          선택·복사가 가능해야 하므로 selectable을 단다(문제 2). */}
      <View style={styles.linkBody}>
        {/* 인스타(alwaysEmbed)는 임베드가 프로필·캡션을 자체 표시하므로 우리가 따로 긁어온
            제목·설명(og)은 중복이라 비노출한다(삭제 아님 — 아래 조건만 걷어내면 복구).
            데이터는 여전히 저장되고 검색·상세에는 그대로 쓰인다. */}
        {alwaysEmbed ? null : (
          <>
            <Text
              variant="bodyStrong"
              style={styles.linkTitle}
              selectable={Platform.OS === 'web'}
            >
              {titleText}
            </Text>
            {captionText ? (
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.linkDescription}
                selectable={Platform.OS === 'web'}
              >
                {captionText}
              </Text>
            ) : null}
          </>
        )}
        {dataRows.map((r) => (
          <LinkDataRow
            key={r.label}
            label={r.label}
            value={r.value}
            numberOfLines={r.lines}
            selectable={Platform.OS === 'web'}
          />
        ))}
        {/* 출처 행: [siteName ←공간→ ✳ TAG] */}
        <View style={styles.sourceRow}>
          <Text
            variant="micro"
            color={colors.textTertiary}
            style={styles.sourceSite}
            numberOfLines={1}
            selectable={Platform.OS === 'web'}
          >
            {displaySiteName(link, t)}
          </Text>
          <View style={styles.sourceTagRow}>
            <TagIcon size={11} strokeWidth={2} color={colors.textTertiary} />
            <Text
              variant="micro"
              color={colors.textTertiary}
              style={styles.sourceTag}
              numberOfLines={1}
              selectable={Platform.OS === 'web'}
            >
              {tag}
            </Text>
          </View>
        </View>
      </View>
      {/* 존 3(바로가기): 모든 링크 카드 공통. 임베드 카드에서 외부로 나가는 유일한 출구. */}
      <Pressable
        onPress={openExternal}
        accessibilityRole="link"
        style={({ hovered, pressed }) => [
          styles.openRow,
          rowFill(colors, { hovered, pressed }),
        ]}
      >
        <ExternalLink size={13} strokeWidth={2} color={colors.ink} />
        <Text variant="label" color={colors.ink}>
          {t('chat.openLink')}
        </Text>
      </Pressable>
      {/* 전화걸기: 전화번호가 있는 장소 카드 한정 — 바로가기와 같은 행 문법. */}
      {m?.phone ? (
        <Pressable
          onPress={callPhone}
          accessibilityRole="link"
          style={({ hovered, pressed }) => [
            styles.openRow,
            rowFill(colors, { hovered, pressed }),
          ]}
        >
          <Phone size={13} strokeWidth={2} color={colors.ink} />
          <Text variant="label" color={colors.ink}>
            {t('chat.callPhone')}
          </Text>
        </Pressable>
      ) : null}
    </BrutalFrame>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // 링크 카드 안쪽: 배경색 + 클리핑 (썸네일이 보더 안에 들어가게)
    // 라운드는 말풍선(24)과 결 맞추되 큰 면이라 한 단계 낮게
    linkInner: {
      backgroundColor: colors.background,
      overflow: 'hidden',
      borderRadius: 18,
    },
    linkComment: {
      lineHeight: 21,
      paddingHorizontal: 14,
      paddingTop: 12,
      paddingBottom: 10,
    },
    // 눌림 피드백 — 미디어 존을 살짝 죽인다(기존 TouchableOpacity 0.85와 동일 감각).
    mediaPressed: {
      opacity: 0.85,
    },
    // 썸네일 래퍼 — mediaFrame()이 계산한 크기(width/maxWidth/aspectRatio/alignSelf)를 여기
    // 얹는다(width:'100%'는 가로/정방형 프레임의 기본값일 뿐, 세로 프레임은 덮어쓴다). 영상 길이
    // 배지·오버레이 칩의 절대위치 기준도 이 컨테이너라, 안쪽 이미지가 래퍼를 정확히 채워야
    // 장식이 실제 이미지 경계와 어긋나지 않는다.
    thumbWrap: {
      width: '100%',
      position: 'relative',
    },
    // 크기는 래퍼(thumbWrap)가 갖고, 이미지 자신은 항상 래퍼를 꽉 채우기만 한다.
    thumbnail: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.surface,
    },
    // 썸네일이 없는 임베드 링크(인스타·X)의 자리 표시 — 보더 없는 surface 면 + 중앙 글리프.
    embedPlaceholder: {
      width: '100%',
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderLabel: {
      marginTop: 6,
      letterSpacing: 0.8,
    },
    // 썸네일 정중앙에 재생/펼치기 칩을 놓기 위한 투명 레이어(터치는 바깥 Pressable이 받는다).
    overlayCenter: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // 이미지 위 오버레이라 테마와 무관한 고정 검정 스크림 + 흰 글리프(라운드 0 — 길이 배지와 동일 재질).
    overlayChip: {
      backgroundColor: OVERLAY_SCRIM,
      borderRadius: 0,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    // 영상 길이 배지 — 이미지 위 오버레이라 테마와 무관한 고정 검정 스크림 + 흰 모노(라운드 0).
    durationBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      backgroundColor: OVERLAY_SCRIM,
      borderRadius: 0,
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    durationText: {
      fontSize: 10,
      lineHeight: 13,
    },
    // 펼친 임베드 + 우상단 닫기 칩의 기준 컨테이너 — mediaFrame(expanded:true)의 크기를 얹는다
    // (thumbWrap과 동일 원리: 안쪽 EmbedFrame은 이 래퍼를 꽉 채우기만 해서 닫기 칩 위치가
    // 실제 임베드 경계와 어긋나지 않는다).
    embedWrap: {
      width: '100%',
      position: 'relative',
    },
    embedClose: {
      position: 'absolute',
      top: 6,
      right: 6,
      backgroundColor: OVERLAY_SCRIM,
      borderRadius: 0,
      padding: 6,
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
    // 출처 행: siteName은 왼쪽(길면 truncate), ✳ TAG는 오른쪽 끝.
    sourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    sourceSite: {
      flexShrink: 1,
      paddingRight: 8,
    },
    // 꼬리표: [자동구분 아이콘 + TAG] 한 묶음.
    sourceTagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    sourceTag: {
      letterSpacing: 0.8,
    },
    // 바로가기 행 — 본문과 점선(카드 안 콘텐츠 구분 문법)으로 나눈 풀폭 액션. 터치 타깃 44pt 확보.
    openRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderTopWidth: 1,
      borderStyle: 'dotted',
      borderTopColor: colors.border,
    },
  });
