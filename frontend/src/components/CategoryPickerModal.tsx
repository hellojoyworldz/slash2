import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Friend, Message } from '../api';
import { errorText } from '../i18n/errors';
import { notify } from '../notify';
import { pickDefaultCategoryColor } from '../theme';
import { CategoryAvatar } from './CategoryAvatar';
import { PICKER_TILE_SIZE, PickerModal, PickerRow } from './PickerModal';

interface Props {
  visible: boolean;
  token: string | null;
  /** 분류를 바꿀 대상 메시지. 현재 friendId로 활성 행을 표시한다. */
  message: Message | null;
  /** 선택지로 보여줄 분류 목록(화면이 로드한 것을 넘긴다). */
  friends: Friend[];
  /** "전체(미분류)" 행 아바타 색(전체 프로필 색). */
  selfColor: string | null;
  /** 스크림 탭·Android 뒤로가기·웹 Esc로 닫기 */
  onClose: () => void;
  /** PATCH 성공 시 서버가 돌려준 최신 메시지로 목록·상세를 갱신하도록 화면에 위임(보기 모드). */
  onChanged?: (updated: Message) => void;
  /** 새 분류 생성으로 전역 분류가 바뀌면 호출 — 화면이 자기 분류 목록을 다시 로드(bumpRooms). */
  onFriendsChanged: () => void;
  /** 수정 모드 스테이징: true면 [저장]이 PATCH 대신 고른 friendId를 onPicked로 돌려주고 닫는다.
   *  (분류 생성 "+추가"는 스테이징과 무관하게 즉시 — 목록에 떠야 하니. 이 메시지엔 선택만 반영.) */
  staged?: boolean;
  /** 스테이징 모드 [저장] 시 고른 분류(friendId|null)를 호출자에게 돌려준다. */
  onPicked?: (friendId: string | null) => void;
}

// 분류 선택 픽커 — 태그 픽커와 한 문법(PickerModal 골격 + PickerRow 행).
// "고르기 → 저장": 위는 새 분류 이름 입력 + [추가](생성은 즉시 — 목록에 떠야 하니, 단 이 메시지엔
// 선택 상태로만 반영·자동 선택), 아래는 [전체(미분류)] + 분류들 중 하나를 로컬로 고른다(PATCH 없음).
// 행 = [CategoryAvatar][이름], 선택 = surface 채움(체크 아이콘 없음). 단일 소속이라 활성 행은 하나.
// 푸터 [저장]에서만 실제 PATCH — 원래 friendId와 같으면 no-op으로 그냥 닫는다.
export function CategoryPickerModal({
  visible,
  token,
  message,
  friends,
  selfColor,
  onClose,
  onChanged,
  onFriendsChanged,
  staged,
  onPicked,
}: Props) {
  const { t } = useTranslation();
  // 생성한 분류를 즉시 목록에 얹으려고 로컬 사본을 든다(prop 재로드가 오면 그 값으로 재시드).
  const [localFriends, setLocalFriends] = useState<Friend[]>([]);
  // 로컬 선택 상태 — [저장]을 눌러야 PATCH된다. 세션 message는 스냅샷이라 그대로 기준값으로 쓴다.
  const [currentFriendId, setCurrentFriendId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLocalFriends(friends);
  }, [visible, friends]);

  useEffect(() => {
    if (!visible) return;
    setCurrentFriendId(message?.friendId ?? null);
    setNewName('');
  }, [visible, message?.id]);

  // 행 탭 = 로컬 선택만 변경. PATCH 없음(저장 때 한 번에).
  const select = (friendId: string | null) => {
    setCurrentFriendId(friendId);
  };

  // 새 분류 생성(미사용 프리셋 순서대로 기본색 자동 지정) → 목록에 추가 → 선택 상태에만 반영.
  const onAdd = async () => {
    if (adding || !token) return;
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const color = pickDefaultCategoryColor(localFriends);
      const created = await api.createFriend(token, name, color);
      setLocalFriends((prev) => [...prev, created]);
      setNewName('');
      onFriendsChanged();
      setCurrentFriendId(created.id);
    } catch (e) {
      notify(t('common.notice'), errorText(e));
    } finally {
      setAdding(false);
    }
  };

  // [저장] — 변경 없으면 no-op으로 닫고, 바뀐 경우만 PATCH. 실패 시 알리고 모달을 유지(재시도 가능).
  const onSave = async () => {
    if (saving) return;
    // 수정 모드 스테이징: PATCH 없이 고른 값을 돌려주고 닫는다(적용은 수정 [저장]이 일괄).
    if (staged) {
      onPicked?.(currentFriendId);
      onClose();
      return;
    }
    const original = message?.friendId ?? null;
    if (currentFriendId === original) {
      onClose();
      return;
    }
    if (!token || !message) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      const updated = await api.updateMessageFriend(token, message.id, currentFriendId);
      onChanged?.(updated);
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
      title={t('chat.menu.editCategory')}
      onClose={onClose}
      newName={newName}
      onChangeNewName={setNewName}
      onAdd={onAdd}
      addPlaceholder={t('friends.newPlaceholder')}
      adding={adding}
      addLabel={t('common.add')}
      cancelLabel={t('common.cancel')}
      saveLabel={t('common.save')}
      onSave={onSave}
      saving={saving}
    >
      {/* 전체(미분류) — selfColor 아바타. friendId=null로 되돌린다. */}
      <PickerRow
        tile={<CategoryAvatar color={selfColor} size={PICKER_TILE_SIZE} />}
        label={t('list.uncategorized')}
        selected={currentFriendId === null}
        onPress={() => select(null)}
        multi={false}
      />
      {localFriends.map((friend) => (
        <PickerRow
          key={friend.id}
          tile={<CategoryAvatar color={friend.color ?? null} size={PICKER_TILE_SIZE} />}
          label={friend.name}
          selected={currentFriendId === friend.id}
          onPress={() => select(friend.id)}
          multi={false}
        />
      ))}
    </PickerModal>
  );
}
