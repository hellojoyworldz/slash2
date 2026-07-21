import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { api, Message } from '../api';
import { notify } from '../notify';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useTagCrud } from '../use-tags';
import { HashTile, PickerModal, PickerRow } from './PickerModal';
import { Text } from './Text';

interface Props {
  visible: boolean;
  token: string | null;
  /** 태그를 편집할 대상 메시지. 현재 tagIds로 선택을 초기화한다. */
  message: Message | null;
  onClose: () => void;
  /** PATCH 성공 시 서버가 돌려준 최신 메시지로 목록·상세를 갱신하도록 알린다(보기 모드). */
  onSaved?: (updated: Message) => void;
  /** 태그 생성으로 전역 태그가 바뀌면 호출(호출부가 태그명 캐시를 갱신). */
  onTagsChanged: () => void;
  /** 수정 모드 스테이징: true면 [저장]이 PATCH 대신 고른 tagIds를 onPicked로 돌려주고 닫는다.
   *  (태그 생성 "+추가"는 스테이징과 무관하게 즉시 — 목록에 떠야 하니. 이 메시지엔 선택만 반영.) */
  staged?: boolean;
  /** 스테이징 모드 [저장] 시 고른 태그 목록을 호출자에게 돌려준다. */
  onPicked?: (tagIds: string[]) => void;
}

// 태그 선택 픽커 — 분류 픽커와 한 문법(PickerModal 골격 + PickerRow 행).
// "고르기 → 저장": 위는 새 태그 이름 입력 + [추가](중복 409 → errors.tag_name_taken, 생성은
// 즉시 — 목록에 떠야 하니, 단 이 메시지엔 선택 상태로만 반영·자동 체크), 아래는 내 태그 목록
// 멀티 선택을 로컬로 고른다(PATCH 없음). 행 = [# 타일][이름], 선택 = surface 채움(체크 아이콘 없음).
// 푸터 [저장]에서만 tagIds 전체를 PATCH. 관리(이름수정·삭제·고정·순서)는 태그 탭 몫 — 픽커는 선택+추가 전용.
export function TagPickerModal({
  visible,
  token,
  message,
  onClose,
  onSaved,
  onTagsChanged,
  staged,
  onPicked,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 태그 목록·추가는 공용 훅에서. 여기선 멀티 선택·저장만 얹는다(관리는 태그 탭).
  const { tags, reload, addTag } = useTagCrud(token);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  // 열릴 때(또는 대상 변경 시): 태그 목록 fetch + 대상 메시지의 현재 태그로 선택 초기화.
  useEffect(() => {
    if (!visible || !token) return;
    setSelected(new Set(message?.tagIds ?? []));
    setNewName('');
    reload();
  }, [visible, token, message?.id, reload]);

  // 행 탭 = 로컬 선택만 토글. PATCH 없음(저장 때 한 번에 tagIds 전체 교체).
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 새 태그 생성 → 목록에 추가 → 선택 상태에만 반영(자동 체크).
  const onAdd = async () => {
    if (adding) return;
    setAdding(true);
    const created = await addTag(newName);
    setAdding(false);
    if (!created) return;
    setNewName('');
    onTagsChanged();
    setSelected((prev) => new Set(prev).add(created.id));
  };

  // [저장] — tagIds 전체를 PATCH. 실패 시 알리고 모달을 유지(재시도 가능).
  const onSave = async () => {
    // 수정 모드 스테이징: PATCH 없이 고른 태그 목록을 돌려주고 닫는다(적용은 수정 [저장]이 일괄).
    if (staged) {
      onPicked?.([...selected]);
      onClose();
      return;
    }
    if (saving || !token || !message) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateMessageTags(token, message.id, [...selected]);
      onSaved?.(updated);
      onClose();
    } catch {
      notify(t('common.notice'), t('chat.tryAgainLater'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PickerModal
      visible={visible}
      title={t('tags.title')}
      onClose={onClose}
      newName={newName}
      onChangeNewName={setNewName}
      onAdd={onAdd}
      addPlaceholder={t('tags.newPlaceholder')}
      adding={adding}
      addLabel={t('common.add')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      onSave={onSave}
      saving={saving}
    >
      {tags.length === 0 ? (
        <Text variant="caption" color={colors.textTertiary} style={styles.emptyHint}>
          {t('tags.empty')}
        </Text>
      ) : (
        <View>
          {tags.map((tag) => (
            <PickerRow
              key={tag.id}
              tile={<HashTile />}
              label={tag.name}
              selected={selected.has(tag.id)}
              onPress={() => toggle(tag.id)}
              multi
            />
          ))}
        </View>
      )}
    </PickerModal>
  );
}

const makeStyles = (_colors: ThemeColors) =>
  StyleSheet.create({
    emptyHint: {
      marginTop: 2,
      lineHeight: 18,
    },
  });
