import { ComponentType, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  Copy,
  Eye,
  Hash,
  Megaphone,
  Pencil,
  Share2,
  Slash,
  Trash2,
} from 'lucide-react-native';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { Button } from './Button';
import { Text } from './Text';

// lucide 아이콘 컴포넌트 타입.
type IconComponent = ComponentType<{
  size?: number;
  color?: string;
  strokeWidth?: number;
}>;

interface Props {
  visible: boolean;
  /** 스크림 탭·Android 뒤로가기·웹 Esc로 닫기 */
  onClose: () => void;
  /** 상세보기 — 메시지 상세 모달(채팅형)/카드 상세 패널(목록형)을 연다. */
  onDetail: () => void;
  onCopy: () => void;
  onShare: () => void;
  /** 공지 토글. isNotice면 "공지 해제", 아니면 "공지". */
  onNotice: () => void;
  isNotice: boolean;
  onTags: () => void;
  onEditContent: () => void;
  onEditCategory: () => void;
  onDelete: () => void;
}

// 메시지 ⋮/long-press 액션 메뉴 — 카카오톡 나에게 보내기 스타일 컴팩트 행 리스트.
// 앱의 ModalCard 단일 문법(연한 스크림 + 중앙 카드 1px border·라운드 0·bg background·폭 360)은
// 그대로 유지하되, 내용은 큰 버튼 대신 각 행 [라벨(왼쪽) ↔ 아이콘(오른쪽 18px textSecondary)]
// 행 높이 ~48, 행 사이 hairline. 삭제는 점선 구분선 아래(앱 크롬이 흑백이라 빨강 없음).
// ModalCard 컴포넌트 자체는 단일 confirm/cancel 푸터 모델이라 N개 행 메뉴에 안 맞아
// 같은 시각 문법을 재현한 전용 오버레이로 만든다. 채팅형·목록형이 공유해 메뉴 문법을 통일한다.
export function MessageActionMenu({
  visible,
  onClose,
  onDetail,
  onCopy,
  onShare,
  onNotice,
  isNotice,
  onTags,
  onEditContent,
  onEditCategory,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // Android 하드웨어 뒤로가기(ModalCard와 동일).
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  // 웹 Esc 닫기(role dialog 관례).
  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  // 삭제를 제외한 상단 항목 — 확정 순서: 상세보기·복사·공유·공지·분류·태그·수정.
  const items: { key: string; label: string; Icon: IconComponent; onPress: () => void }[] = [
    { key: 'detail', label: t('chat.menu.detail'), Icon: Eye, onPress: onDetail },
    { key: 'copy', label: t('chat.menu.copy'), Icon: Copy, onPress: onCopy },
    { key: 'share', label: t('chat.menu.share'), Icon: Share2, onPress: onShare },
    {
      key: 'notice',
      label: isNotice ? t('chat.menu.noticeOff') : t('chat.menu.notice'),
      Icon: Megaphone,
      onPress: onNotice,
    },
    { key: 'editCategory', label: t('chat.menu.editCategory'), Icon: Slash, onPress: onEditCategory },
    { key: 'tags', label: t('chat.menu.tags'), Icon: Hash, onPress: onTags },
    { key: 'editContent', label: t('chat.menu.editContent'), Icon: Pencil, onPress: onEditContent },
  ];

  const renderRow = (
    key: string,
    label: string,
    Icon: IconComponent,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text variant="label" style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <Icon size={18} strokeWidth={2} color={colors.textSecondary} />
    </Pressable>
  );

  return (
    <View style={styles.overlayRoot}>
      <Pressable
        style={styles.scrim}
        onPress={onClose}
        accessible={false}
        focusable={false}
      />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card} accessibilityViewIsModal>
          <Text variant="heading" accessibilityRole="header" style={styles.title}>
            {t('chat.menu.title')}
          </Text>
          <View style={styles.list}>
            {items.map((it, i) => (
              <View key={it.key}>
                {i > 0 ? <View style={styles.hairline} /> : null}
                {renderRow(it.key, it.label, it.Icon, it.onPress)}
              </View>
            ))}
            {/* 삭제는 점선 구분선 아래로 편집 액션과 떼어 놓는다(흑백 유지). */}
            <View style={styles.divider} />
            {renderRow('delete', t('common.delete'), Trash2, onDelete)}
          </View>
          {/* 모달 공통 문법: 우측 정렬 공용 Button(ghost) 닫기 — 손으로 그리지 않는다. */}
          <View style={styles.closeRow}>
            <Button label={t('common.close')} variant="ghost" onPress={onClose} />
          </View>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlayRoot: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    scrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.background,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 10,
    },
    title: {
      marginBottom: 6,
    },
    list: {
      marginTop: 4,
    },
    // 각 행: [라벨 왼쪽] ↔ [아이콘 오른쪽], 높이 ~48.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 48,
      paddingVertical: 6,
    },
    rowPressed: {
      backgroundColor: colors.surface,
    },
    rowLabel: {
      flexShrink: 1,
      paddingRight: 12,
    },
    // 행 사이 hairline(실선 1px, 조용히).
    hairline: {
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
    },
    // 삭제 위 점선 구분선.
    divider: {
      borderTopWidth: 1,
      borderStyle: 'dotted',
      borderTopColor: colors.border,
      marginTop: 4,
    },
    // 우측 정렬 ghost 닫기 — ModalCard 액션 줄 문법과 통일.
    closeRow: {
      marginTop: 14,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
  });
