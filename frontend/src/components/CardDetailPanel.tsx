import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ellipsis, X } from 'lucide-react-native';
import { AutoKind, Message } from '../api';
import { formatDateStamp } from '../time';
import { layout, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Button } from './Button';
import { LinkDataRow } from './LinkDataRow';
import { RemoteImage } from './RemoteImage';
import { Text } from './Text';

// 가격 표기(MessageBubble와 동일 규칙) — KRW는 ₩, 그 외는 통화코드 + 금액.
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

// 영상 길이(MessageBubble와 동일 규칙) — 1시간 미만 m:ss, 이상 h:mm:ss.
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// URL에서 도메인만 뽑는다(출처 표시용). 파싱 실패 시 원본을 그대로 쓴다.
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

interface Props {
  /** 상세를 볼 카드 메시지(열림 상태). null이면 호출부가 렌더하지 않는다. */
  message: Message;
  /** 이 메시지의 분류 이름(미분류면 "미분류" 라벨). */
  friendName: string;
  /** 분류색(hex). 이름 옆 색점에 쓴다. */
  color: string | null;
  /** 자동구분 종류(꼬리표 렌더용). */
  autoKind: AutoKind;
  /** 이 메시지에 붙은 태그 이름들. `태그 ┄ #a #b` 리더라인으로 표시. */
  tagNames?: string[] | null;
  onClose: () => void;
  /** ⋯ = 기존 long-press 액션시트(분류 변경/삭제) 재사용. */
  onOpenMenu: (m: Message) => void;
}

// 카드 상세 = 오른쪽 패널(노션 사이드 픽).
//  · ≥900px: 우측 고정폭(420) 패널, 좌측 1px hairline 경계, 그림자 금지. 바깥/Esc/X로 닫힘.
//  · <900px: 전체 화면 오버레이(같은 내용).
// 내용: 썸네일 → 제목(링크) → 리더라인(분류·자동구분·날짜·출처·메타) → 메모 본문(메모).
// 액션: primary 원본 열기(장소는 지도 앱에서 열기 추가) · ghost 닫기 · 헤더 ⋯.
export function CardDetailPanel({
  message,
  friendName,
  color,
  autoKind,
  tagNames,
  onClose,
  onOpenMenu,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;

  // 웹에서 Esc로 닫기(role dialog 관례).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isMemo = message.kind === 'text';
  const isLink = message.kind === 'link' && !!message.url;
  const isPlace = message.linkType === 'place';
  const meta = message.linkMeta ?? null;
  const thumbUri = message.ogImage ?? null;
  const title = message.ogTitle ?? message.url ?? message.content;
  const source =
    message.siteName ?? (message.url ? domainOf(message.url) : null);

  const openOriginal = useCallback(() => {
    if (message.url) Linking.openURL(message.url);
  }, [message.url]);

  // 지도 앱에서 열기: 좌표가 있으면 카카오맵 딥링크, 없으면 원본 URL.
  const openMap = useCallback(() => {
    const name = meta?.placeName ?? message.ogTitle ?? '';
    if (meta?.lat != null && meta?.lng != null) {
      const q = encodeURIComponent(name);
      Linking.openURL(`https://map.kakao.com/link/map/${q},${meta.lat},${meta.lng}`);
    } else if (message.url) {
      Linking.openURL(message.url);
    }
  }, [meta, message.ogTitle, message.url]);

  return (
    <View style={styles.root}>
      {/* 바깥 클릭 = 닫기. 데스크톱은 옅은 스크림(보드가 뒤로 비침), 모바일은 전체 오버레이. */}
      <Pressable
        style={[styles.scrim, isDesktop ? styles.scrimDesktop : styles.scrimMobile]}
        onPress={onClose}
        accessible={false}
        focusable={false}
      />
      <View
        style={[styles.panel, isDesktop ? styles.panelDesktop : styles.panelMobile]}
        accessibilityViewIsModal
        accessibilityLabel={t('a11y.cardDetail')}
      >
        {/* 헤더: X(닫기) · ⋯(액션시트) */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <X size={22} strokeWidth={2} color={colors.ink} />
          </TouchableOpacity>
          <View style={styles.headerSpacer} />
          <TouchableOpacity
            onPress={() => onOpenMenu(message)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.messageMenu')}
          >
            <Ellipsis size={22} strokeWidth={2} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {thumbUri ? (
            <RemoteImage uri={thumbUri} style={styles.thumb} resizeMode="cover" />
          ) : null}

          {/* 제목 — 링크만(메모는 아래 본문에 전문 표시). */}
          {!isMemo ? (
            <Text variant="heading" style={styles.title}>
              {title}
            </Text>
          ) : null}

          {/* 리더라인 행들 */}
          <View style={styles.rows}>
            {/* 공지 ┄ 등록됨 (공지 메시지만) */}
            {message.isNotice ? (
              <LinkDataRow label={t('list.notice')} value={t('list.noticeOn')} />
            ) : null}

            {/* 분류 ┄ 이름(색점) */}
            <View style={styles.catRow}>
              <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                {t('list.category')}
              </Text>
              <View style={styles.leader} />
              <View
                style={[styles.colorDot, { backgroundColor: color ?? colors.surface }]}
              />
              <Text
                variant="micro"
                color={colors.textPrimary}
                style={styles.catName}
                numberOfLines={1}
              >
                {friendName}
              </Text>
            </View>

            {/* 태그 ┄ #a #b */}
            {tagNames && tagNames.length ? (
              <LinkDataRow
                label={t('list.tags')}
                value={tagNames.map((n) => `#${n}`).join(' ')}
                numberOfLines={2}
              />
            ) : null}

            {/* 자동구분 ┄ ✳ PLACE */}
            <LinkDataRow
              label={t('list.autoKind')}
              value={`✳ ${autoKind.toUpperCase()}`}
            />

            {/* 날짜 ┄ 2026.07.19 */}
            <LinkDataRow
              label={t('list.date')}
              value={formatDateStamp(message.createdAt)}
            />

            {/* 출처 ┄ 도메인 (탭 = 원본 열기) */}
            {isLink && source ? (
              <LinkDataRow
                label={t('chat.linkData.source')}
                value={source}
                onPress={openOriginal}
                accessibilityLabel={t('chat.linkSheet.openSource', { name: source })}
              />
            ) : null}

            {/* linkMeta 상세 */}
            {meta?.address ? (
              <LinkDataRow
                label={t('chat.linkData.address')}
                value={meta.address}
                numberOfLines={2}
              />
            ) : null}
            {meta?.hours ? (
              <LinkDataRow label={t('chat.linkData.hours')} value={meta.hours} />
            ) : null}
            {meta?.phone ? (
              <LinkDataRow label={t('chat.linkData.phone')} value={meta.phone} />
            ) : null}
            {meta?.price != null ? (
              <LinkDataRow
                label={t('chat.linkData.price')}
                value={formatPrice(meta.price, meta.currency)}
              />
            ) : null}
            {meta?.durationSec != null ? (
              <LinkDataRow
                label={t('list.duration')}
                value={formatDuration(meta.durationSec)}
              />
            ) : null}
            {meta?.channel ? (
              <LinkDataRow label={t('list.channel')} value={meta.channel} />
            ) : null}
          </View>

          {/* 메모 본문 전문 */}
          {isMemo ? (
            <View style={styles.memoWrap}>
              <View style={styles.memoDivider} />
              <Text variant="body" color={colors.textPrimary} style={styles.memoText}>
                {message.content}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {/* 액션: ghost 닫기 · (장소) 지도 앱에서 열기 · primary 원본 열기 */}
        <View style={styles.actions}>
          <Button
            label={t('common.close')}
            variant="ghost"
            onPress={onClose}
            style={styles.actionButton}
          />
          {isPlace ? (
            <Button
              label={t('chat.linkSheet.openMap')}
              variant="outline"
              onPress={openMap}
              style={styles.actionButton}
            />
          ) : null}
          {isLink ? (
            <Button
              label={t('list.openOriginal')}
              variant="primary"
              onPress={openOriginal}
              style={styles.actionButton}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const PANEL_WIDTH = 420;

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
    },
    scrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    // 데스크톱 사이드 픽: 보드가 뒤로 비치도록 옅은 스크림.
    scrimDesktop: {
      backgroundColor: 'rgba(0,0,0,0.18)',
    },
    // 모바일 전체 오버레이: 모달 관례의 스크림.
    scrimMobile: {
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    panel: {
      backgroundColor: colors.background,
    },
    // 우측 고정폭 패널 — 좌측 1px hairline 경계, 그림자 금지.
    panelDesktop: {
      marginLeft: 'auto',
      width: PANEL_WIDTH,
      maxWidth: '100%',
      borderLeftWidth: 1,
      borderLeftColor: colors.hairline,
    },
    // 전체 화면 오버레이(같은 내용).
    panelMobile: {
      flex: 1,
    },
    headerBar: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: layout.statusBarPad + 44,
      paddingTop: layout.statusBarPad,
      paddingBottom: 8,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    headerSpacer: {
      flex: 1,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 24,
    },
    // 링크 카드 라운드 예외(18)는 카드 자체 규칙 — 상세 썸네일은 라운드 0으로 조용히.
    thumb: {
      width: '100%',
      aspectRatio: 1.6,
      backgroundColor: colors.surface,
      marginBottom: 14,
    },
    title: {
      marginBottom: 12,
      lineHeight: 26,
    },
    rows: {
      marginTop: 2,
    },
    // 분류 행 — LinkDataRow와 같은 리더 문법에 색점을 얹는다.
    catRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 6,
    },
    leader: {
      flex: 1,
      minWidth: 16,
      marginHorizontal: 6,
      marginBottom: 3,
      borderBottomWidth: 1,
      borderStyle: 'dotted',
      borderColor: colors.border,
    },
    colorDot: {
      width: 8,
      height: 8,
      marginRight: 6,
      marginBottom: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    catName: {
      flexShrink: 1,
      textAlign: 'right',
    },
    memoWrap: {
      marginTop: 18,
    },
    memoDivider: {
      borderTopWidth: 1,
      borderStyle: 'dotted',
      borderTopColor: colors.border,
      marginBottom: 14,
    },
    memoText: {
      lineHeight: 24,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: Platform.OS === 'ios' ? 30 : 16,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    actionButton: {
      height: 46,
      minWidth: 84,
      paddingHorizontal: 16,
    },
  });
