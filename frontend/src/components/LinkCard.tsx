import { useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LinkType, MessageLink } from '../api';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { BrutalFrame } from './Brutal';
import { LinkDataRow } from './LinkDataRow';
import { Text } from './Text';

// 자동구분 종류 → 출처 행 꼬리표(대문자 모노 글리프). 미분류는 LINK.
const TAG_BY_TYPE: Record<LinkType, string> = {
  place: 'PLACE',
  video: 'VIDEO',
  item: 'ITEM',
};

// 장소 흑백 정적지도 썸네일용 구글 키. 없으면 ogImage로 폴백한다.
const GMAPS_KEY = process.env.EXPO_PUBLIC_GMAPS_STATIC_KEY;

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
}

// 흰 OG 카드([코멘트][썸네일][본문: 타이틀·캡션·데이터 행·출처 행]).
// MessageBubble(말풍선 세그먼트·단일 폴백)·MessageDetail(상세 모달) 공용 — 렌더 중복 구현 금지.
export function LinkCard({ link, comment }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const lt = link.linkType ?? null;
  const m = link.linkMeta ?? null;
  const isPlace = lt === 'place';
  const isVideo = lt === 'video';
  const isItem = lt === 'item';
  const tag = (lt && TAG_BY_TYPE[lt]) || 'LINK';
  // 캡션: 장소는 설명 대신 주소를, 그 외는 ogDescription.
  const captionText = isPlace ? m?.address ?? null : link.ogDescription;
  // 썸네일: 장소는 (키+좌표) 흑백 정적지도 → 없으면 ogImage → 둘 다 없으면 생략.
  const staticMapUrl =
    isPlace && m?.lat != null && m?.lng != null && GMAPS_KEY
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${m.lat},${m.lng}&zoom=16&size=460x240&scale=2&style=saturation:-100&markers=color:0xEBADC4%7C${m.lat},${m.lng}&key=${GMAPS_KEY}`
      : null;
  const thumbUri = staticMapUrl ?? link.ogImage ?? null;
  // 제목: linkMeta.placeName(장소명, ogTitle이 "Google Maps" 같은 제네릭일 때 폴백) → ogTitle → url.
  const titleText = m?.placeName ?? link.ogTitle ?? link.url;
  // 데이터 행: linkMeta에 있는 값은 전부(없으면 그 행 생략). 장소는 영업·전화, 상품은 가격,
  // 영상은 채널·길이(썸네일 배지와 별개로 행에도 표시), 글은 작성자.
  const dataRows: { label: string; value: string }[] = [];
  if (isPlace && m?.hours)
    dataRows.push({ label: t('chat.linkData.hours'), value: m.hours });
  if (isPlace && m?.phone)
    dataRows.push({ label: t('chat.linkData.phone'), value: m.phone });
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

  return (
    <BrutalFrame contentStyle={styles.linkInner}>
      {comment ? (
        <Text variant="body" style={styles.linkComment}>
          {comment}
        </Text>
      ) : null}
      {thumbUri ? (
        <View style={styles.thumbWrap}>
          <Image
            source={{ uri: thumbUri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
          {/* 영상 길이 배지 — durationSec 있을 때만, 썸네일 우하단. */}
          {isVideo && m?.durationSec != null ? (
            <View style={styles.durationBadge}>
              <Text variant="micro" color="#FFFFFF" style={styles.durationText}>
                {formatDuration(m.durationSec)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.linkBody}>
        <Text variant="bodyStrong" style={styles.linkTitle} numberOfLines={2}>
          {titleText}
        </Text>
        {captionText ? (
          <Text
            variant="caption"
            color={colors.textSecondary}
            style={styles.linkDescription}
            numberOfLines={2}
          >
            {captionText}
          </Text>
        ) : null}
        {dataRows.map((r) => (
          <LinkDataRow key={r.label} label={r.label} value={r.value} />
        ))}
        {/* 출처 행: [siteName ←공간→ ✳ TAG] */}
        <View style={styles.sourceRow}>
          <Text
            variant="micro"
            color={colors.textTertiary}
            style={styles.sourceSite}
            numberOfLines={1}
          >
            {displaySiteName(link, t)}
          </Text>
          <Text
            variant="micro"
            color={colors.textTertiary}
            style={styles.sourceTag}
            numberOfLines={1}
          >
            {`✳ ${tag}`}
          </Text>
        </View>
      </View>
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
    // 썸네일 래퍼 — 영상 길이 배지를 우하단에 얹기 위한 기준 컨테이너(비디오 아닐 땐 그냥 감싸기만).
    thumbWrap: {
      width: '100%',
      position: 'relative',
    },
    // 고정 높이 대신 OG 표준 비율(1.91:1) — 카드 폭이 변해도 비율 유지
    thumbnail: {
      width: '100%',
      aspectRatio: 1.91,
      backgroundColor: colors.surface,
    },
    // 영상 길이 배지 — 이미지 위 오버레이라 테마와 무관한 고정 검정 스크림 + 흰 모노(라운드 0).
    durationBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      backgroundColor: 'rgba(0,0,0,0.78)',
      borderRadius: 0,
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    durationText: {
      fontSize: 10,
      lineHeight: 13,
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
    sourceTag: {
      letterSpacing: 0.8,
    },
  });
