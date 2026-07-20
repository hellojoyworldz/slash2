import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { api, Message } from '../api';
import { notify } from '../notify';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useTagCrud } from '../use-tags';
import { Button } from './Button';
import { ModalCard } from './ModalCard';
import { Text } from './Text';

interface Props {
  visible: boolean;
  token: string | null;
  /** 태그를 편집할 대상 메시지. 현재 tagIds로 선택을 초기화한다. */
  message: Message | null;
  onClose: () => void;
  /** 저장 성공 시 서버가 돌려준 최신 메시지로 목록·상세를 갱신하도록 알린다. */
  onSaved: (updated: Message) => void;
  /** 태그 생성·수정·삭제로 전역 태그가 바뀌면 호출(호출부가 태그명 캐시를 갱신). */
  onTagsChanged: () => void;
}

// 태그 선택 모달 — 앱 공용 ModalCard 문법(스크림·카드·타이틀·우측 액션).
// 위: 새 태그 입력 + 추가(중복 409 → errors.tag_name_taken 노출).
// 아래: 내 태그 목록 멀티 "선택 전용"(선택 = ink 채움 체크, 무채색 — 색은 분류의 것).
// 태그 관리(이름 수정·삭제·고정·순서)는 태그 탭이 담당한다 — 여긴 선택·추가만(통일성).
// 저장 = PATCH { tagIds } 전체 교체. 채팅형·목록형이 공유한다.
export function TagPickerModal({
  visible,
  token,
  message,
  onClose,
  onSaved,
  onTagsChanged,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 태그 목록·추가는 공용 훅에서. 여기선 멀티 선택·메시지 저장만 얹는다(관리는 태그 탭).
  const { tags, reload, addTag } = useTagCrud(token);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  // 열릴 때(또는 대상 변경 시): 태그 목록 fetch + 대상 메시지의 현재 태그로 선택 초기화.
  useEffect(() => {
    if (!visible || !token) return;
    setSelected(new Set(message?.tagIds ?? []));
    setNewName('');
    reload();
  }, [visible, token, message?.id, reload]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onAdd = async () => {
    if (adding) return;
    setAdding(true);
    const created = await addTag(newName);
    setAdding(false);
    if (!created) return;
    setSelected((prev) => new Set(prev).add(created.id));
    setNewName('');
    onTagsChanged();
  };

  const save = async () => {
    if (busy || !token || !message) return;
    setBusy(true);
    try {
      const updated = await api.updateMessageTags(token, message.id, [...selected]);
      onSaved(updated);
      onClose();
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalCard
      visible={visible}
      title={t('tags.title')}
      onClose={onClose}
      confirmLabel={t('common.save')}
      cancelLabel={t('common.cancel')}
      onConfirm={save}
      busy={busy}
    >
      {/* 새 태그 추가 */}
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          value={newName}
          onChangeText={setNewName}
          placeholder={t('tags.newPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          onSubmitEditing={onAdd}
          returnKeyType="done"
          editable={!adding}
        />
        <Button
          label={t('common.add')}
          variant="outline"
          onPress={onAdd}
          style={styles.addButton}
        />
      </View>

      {/* 내 태그 목록 — 멀티 선택 */}
      {tags.length === 0 ? (
        <Text variant="caption" color={colors.textTertiary} style={styles.emptyHint}>
          {t('tags.empty')}
        </Text>
      ) : (
        <View style={styles.list}>
          {tags.map((tag) => {
            const isSel = selected.has(tag.id);
            return (
              <Pressable
                key={tag.id}
                style={styles.tagMain}
                onPress={() => toggle(tag.id)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSel }}
                accessibilityLabel={tag.name}
              >
                <View style={[styles.checkbox, isSel && styles.checkboxOn]}>
                  {isSel ? (
                    <Check size={13} strokeWidth={3} color={colors.onAccent} />
                  ) : null}
                </View>
                <Text variant="body" style={styles.tagName} numberOfLines={1}>
                  {`#${tag.name}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </ModalCard>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    addInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 0,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: colors.textPrimary,
      backgroundColor: colors.background,
    },
    addButton: {
      height: 42,
      minWidth: 68,
      paddingHorizontal: 14,
    },
    emptyHint: {
      marginTop: 16,
      lineHeight: 18,
    },
    list: {
      marginTop: 14,
    },
    tagMain: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
    },
    // 선택 체크박스 — 무채색(색은 분류의 것). 선택 시 ink 채움.
    checkbox: {
      width: 18,
      height: 18,
      borderRadius: 0,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    checkboxOn: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    tagName: {
      flexShrink: 1,
    },
  });
