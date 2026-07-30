import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Pencil, Star, StarOff, Trash2 } from 'lucide-react-native';
import { api, Friend, Message } from '../api';
import { useCollapsedSections } from '../collapsed-sections';
import { errorText } from '../i18n/errors';
import { confirmDialog, notify } from '../notify';
import { useSelectedRoom } from '../selected-room';
import { pickDefaultCategoryColor, ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { CategoryAvatar } from './CategoryAvatar';
import {
  PICKER_TILE_SIZE,
  PickerModal,
  PickerReorderRow,
  PickerRow,
  usePickerReorderGuard,
  usePickerSwipeTapGuard,
} from './PickerModal';
import { SwipeAction, SwipeActionsA11y } from './SwipeableRow';
import { Text } from './Text';

// "전체(미분류)" 행의 스크롤 key 센티널(friendId=null 자리).
const ALL_KEY = '__all__';

interface Props {
  visible: boolean;
  token: string | null;
  /** 분류를 바꿀 대상 메시지. 현재 friendId로 활성 행을 표시한다. */
  message: Message | null;
  /** 선택지로 보여줄 분류 목록(화면이 로드한 것을 넘긴다). */
  friends: Friend[];
  /** "전체" 행 아바타 색(전체 프로필 색). */
  selfColor: string | null;
  /** "전체" 행 부제 — 커스텀 설명(selfDescription)이 있으면 그것, 없으면 '전체 메시지 보기'는 호출부 폴백 대신 여기서 처리. */
  selfDescription?: string | null;
  /** 스크림 탭·Android 뒤로가기·웹 Esc로 닫기 */
  onClose: () => void;
  /** PATCH 성공 시 서버가 돌려준 최신 메시지로 목록·상세를 갱신하도록 화면에 위임(보기 모드). */
  onChanged?: (updated: Message) => void;
  /** 새 분류 생성으로 전역 분류가 바뀌면 호출 — 화면이 자기 분류 목록을 다시 로드(bumpRooms). */
  onFriendsChanged: () => void;
  /** 타이틀 [+] — 루트 상주 분류 추가 모달(category-edit `open()`)을 연다. 픽커는 목록 전용이라
   *  추가 폼을 직접 들지 않는다(태그 픽커 onAddTag 미러). 호출부가 세션을 열고,
   *  생성되면 onCreated로 만들어진 분류를 돌려준다 — 픽커가 목록에 얹고 그 항목으로 스크롤한다.
   *  defaultColor = 추가 폼의 기본 선택색(픽커가 현재 목록으로 계산한 미사용 프리셋). */
  onAddFriend: (onCreated: (friend: Friend) => void, defaultColor: string) => void;
  /** 수정 모드 스테이징: true면 [저장]이 PATCH 대신 고른 friendId를 onPicked로 돌려주고 닫는다.
   *  (분류 생성 "+추가"는 스테이징과 무관하게 즉시 — 목록에 떠야 하니. 이 메시지엔 선택만 반영.) */
  staged?: boolean;
  /** 스테이징 모드 [저장] 시 고른 분류(friendId|null)를 호출자에게 돌려준다. */
  onPicked?: (friendId: string | null) => void;
  /** 관리 모드: 메시지 컨텍스트 없이 분류를 "추가"하는 전용 모드(그룹 탭 +·목록형 [+ 분류]).
   *  선택 없이 분류 목록 + 인라인 추가(이름 + '설명 (선택)') + 밑줄 [닫기]만 둔다(TagPickerModal manage 미러).
   *  색은 pickDefaultCategoryColor로 자동 배정, 프로필(색) 편집은 스와이프 [수정]의 category-edit 폼 몫. */
  manage?: boolean;
  /** 관리 모드 행 탭 시 그 분류의 수정 폼을 연다(선택 모드엔 넘기지 않음 — 행 탭=선택 유지). */
  onEditFriend?: (friend: Friend) => void;
  /** "전체" 프로필(색·설명) 편집 폼을 연다(self 모드). 있으면 전체 행에 스와이프 [수정] + 관리 모드 탭이 붙는다. */
  onEditSelf?: () => void;
}

// 분류 선택 픽커 — 태그 픽커와 한 문법(PickerModal 골격 + PickerRow 행). **목록 전용**이다:
// 신규 생성은 타이틀 [+]가 여는 루트 상주 추가 모달(category-edit) 몫이고, 여기엔 추가 폼이 없다.
// "고르기 → 저장": 분류들 중 하나를 로컬로 고르고(PATCH 없음), 푸터 [저장]에서만 실제 PATCH —
// 원래 friendId와 같으면 no-op으로 그냥 닫는다.
// 행 = [CategoryAvatar][이름], 선택 = surface 채움(체크 아이콘 없음). 단일 소속이라 활성 행은 하나.
export function CategoryPickerModal({
  visible,
  token,
  message,
  friends,
  selfColor,
  selfDescription,
  onClose,
  onChanged,
  onFriendsChanged,
  onAddFriend,
  staged,
  onPicked,
  manage = false,
  onEditFriend,
  onEditSelf,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 생성한 분류를 즉시 목록에 얹으려고 로컬 사본을 든다(prop 재로드가 오면 그 값으로 재시드).
  const [localFriends, setLocalFriends] = useState<Friend[]>([]);
  // 추가/수정 폼(루트 상주)이 분류를 만들거나 이름·색을 바꾸거나 삭제하면 bumpRooms → roomsVersion.
  const { roomsVersion } = useSelectedRoom();
  // 로컬 선택 상태 — [저장]을 눌러야 PATCH된다. 세션 message는 스냅샷이라 그대로 기준값으로 쓴다.
  const [currentFriendId, setCurrentFriendId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 전체 삭제 진행 중 — 중복 클릭 방지(타이틀 휴지통).
  const [deletingAll, setDeletingAll] = useState(false);
  // 스크롤 타깃 — 열릴 때 현재 분류, 추가 직후 새 분류. PickerModal이 이 key로 스크롤.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  // '목록' 섹션 접힘 상태 — 서버 저장(픽커 전용 키, 본 목록과 독립). 재진입해도 접힘이 유지된다.
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsedSections();
  const listExpanded = !isCollapsed('picker.categories');

  useEffect(() => {
    if (!visible) return;
    setLocalFriends(friends);
  }, [visible, friends]);

  // 열려 있는 동안 분류 변경 신호(roomsVersion)가 오면 목록을 재로드한다 — 타이틀 [+]·행 탭으로 연
  // 추가/수정 폼이 저장·삭제한 결과가 리스트에 즉시 반영되게(태그 픽커의 같은 배선을 미러).
  // 선택 모드는 friends prop이 열 때의 스냅샷이라, 이 재로드가 없으면 폼의 변경이 새지 않는다.
  useEffect(() => {
    if (!visible || !token) return;
    api.listFriends(token).then(setLocalFriends).catch(() => {});
  }, [roomsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visible) return;
    const initial = message?.friendId ?? null;
    setCurrentFriendId(initial);
    // 선택 픽커: 현재 분류로 스크롤(길면 화면 밖일 수 있어). 관리 모드는 선택이 없으니 스크롤 안 함.
    // '전체' 행이 숨김이라(위 주석 처리) 미분류(null) 선택엔 스크롤할 행이 없다 — 대상 없음.
    setScrollTarget(manage ? null : initial);
    // 접힘 상태는 서버 저장이라 열 때 리셋하지 않는다(재진입 시 유지 — 사용자 리포트한 버그 수정).
  }, [visible, message?.id, manage]);

  // 행 탭 = 로컬 선택만 변경. PATCH 없음(저장 때 한 번에).
  const select = (friendId: string | null) => {
    setCurrentFriendId(friendId);
  };

  // 타이틀 [+] — 루트 상주 분류 추가 모달을 픽커 위에 연다(픽커는 열린 채 유지).
  // 기본 선택색은 현재 목록에서 미사용 프리셋을 골라 넘긴다(예전 인라인 추가의 자동 배정과 같은 계약).
  // 생성되면 목록에 즉시 얹고 그 항목으로 스크롤, 선택 픽커면 새 분류를 선택 상태로 만든다.
  const onAdd = () => {
    onAddFriend((created) => {
      setLocalFriends((prev) =>
        prev.some((f) => f.id === created.id) ? prev : [...prev, created],
      );
      onFriendsChanged();
      // 선택 픽커는 새 분류를 선택 상태로, 관리 모드는 선택 없음. 둘 다 새 항목으로 스크롤.
      if (!manage) setCurrentFriendId(created.id);
      setScrollTarget(created.id);
      // 접힌 상태로 추가하면 새 항목이 안 보이니 자동으로 펼친다(접혀 있을 때만 토글).
      if (isCollapsed('picker.categories')) toggleCollapsed('picker.categories');
    }, pickDefaultCategoryColor(localFriends));
  };

  // 행 휴지통 — 확인창 → 분류 삭제(그 분류 메시지는 미분류로). FriendsScreen 스와이프 삭제와 같은 계약.
  // 선택 모드에서 지운 분류가 현재 선택이면 미분류로 되돌린다.
  const onDeleteFriend = async (friend: Friend) => {
    if (!token) return;
    const ok = await confirmDialog({
      title: t('common.delete'),
      message: t('friends.confirmDelete', { name: friend.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteFriend(token, friend.id);
      setLocalFriends((prev) => prev.filter((f) => f.id !== friend.id));
      if (currentFriendId === friend.id) setCurrentFriendId(null);
      onFriendsChanged();
    } catch (e) {
      notify(t('common.notice'), errorText(e));
    }
  };

  // 타이틀 휴지통 — 확인창 → 모든 분류 순차 삭제(메시지는 미분류로). 선택은 미분류로 되돌린다.
  const onDeleteAll = async () => {
    if (!token || deletingAll || localFriends.length === 0) return;
    const ok = await confirmDialog({
      title: t('friends.deleteAllTitle'),
      message: t('friends.deleteAllMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setDeletingAll(true);
    try {
      for (const friend of localFriends) {
        await api.deleteFriend(token, friend.id);
      }
      setLocalFriends([]);
      setCurrentFriendId(null);
      onFriendsChanged();
    } catch (e) {
      notify(t('common.notice'), errorText(e));
    } finally {
      setDeletingAll(false);
    }
  };

  // 목록 드래그 재정렬 커밋 — 본 목록(분류)과 같은 순서 계약(friends 순서 API). 낙관 반영 후 서버 저장,
  // 성공하면 onFriendsChanged로 본 화면 목록을 동기화(재조회가 같은 순서로 맞물려 깜빡임 없음).
  // 실패하면 직전 순서로 복원. 픽커 목록 정렬 = friends prop(=listFriends, position ASC)로 본 목록과 동일.
  const onReorderFriends = useCallback(
    (ids: string[]) => {
      const byId = new Map(localFriends.map((f) => [f.id, f]));
      const next = ids
        .map((id) => byId.get(id))
        .filter((f): f is Friend => f != null);
      if (next.length !== localFriends.length) return;
      const prev = localFriends;
      setLocalFriends(next);
      if (!token) return;
      api
        .reorderFriends(token, ids)
        .then(() => onFriendsChanged())
        .catch(() => {
          setLocalFriends(prev);
          onFriendsChanged();
        });
    },
    [localFriends, token, onFriendsChanged],
  );

  // 즐겨찾기(★) 토글 — 본 목록(FriendsScreen)과 같은 낙관 갱신 계약: 고정(pinned)과는 무관한 별개
  // 표시이고 본 목록(분류) 정렬엔 영향 없다. 별 추가 시 즐겨찾기 섹션 맨 밑(현재 최대
  // favoritePosition+1)에 오도록 값을 부여, 해제 시 null. 성공하면 onFriendsChanged로 본 화면
  // 목록을 동기화하고, 실패하면 로컬을 되돌린 뒤 onFriendsChanged로 재동기화(onReorderFriends 실패
  // 처리와 같은 revert 계약 — 조용히 삼키지 않는다).
  const onToggleFavorite = (friend: Friend) => {
    if (!token) return;
    const nextFavorite = !friend.favorite;
    const maxPos = localFriends.reduce(
      (m, f) =>
        f.favorite && f.favoritePosition != null ? Math.max(m, f.favoritePosition) : m,
      -1,
    );
    const prev = localFriends;
    const next = localFriends.map((f) =>
      f.id === friend.id
        ? { ...f, favorite: nextFavorite, favoritePosition: nextFavorite ? maxPos + 1 : null }
        : f,
    );
    setLocalFriends(next);
    api
      .updateFriendFavorite(token, friend.id, nextFavorite)
      .then(() => onFriendsChanged())
      .catch(() => {
        setLocalFriends(prev);
        onFriendsChanged();
      });
  };

  // 행 왼→오 스와이프 액션 [즐겨찾기][삭제][수정] — 본 목록(분류 탭) 스와이프와 완전히 같은 문법·순서.
  // 즐겨찾기 = 토글(이미 즐겨찾기면 해제), 수정 = 색·프로필 편집 폼(관리 모드 onEditFriend / 선택
  // 모드도 props로 이관받아 동일 동작), 삭제 = 기존 휴지통과 같은 계약(onDeleteFriend가 confirmDialog
  // 포함). 선택·관리 모드 공통.
  const swipeActionsFor = (friend: Friend): SwipeAction[] => [
    {
      key: 'favorite',
      icon: friend.favorite ? StarOff : Star,
      label: friend.favorite ? t('a11y.unfavorite') : t('a11y.favorite'),
      onPress: () => onToggleFavorite(friend),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('common.delete'),
      onPress: () => void onDeleteFriend(friend),
    },
    ...(onEditFriend
      ? [
          {
            key: 'edit',
            icon: Pencil,
            label: t('friends.editTitle'),
            onPress: () => onEditFriend(friend),
          },
        ]
      : []),
  ];

  // "전체" 행 부제 — 커스텀 설명(selfDescription)이 있으면 그것, 없으면 '전체 메시지 보기'(전체 부제 공통 키).
  const allSubtitle = selfDescription || t('friends.sendToMe');
  // "전체" 행 스와이프 — [수정]만(삭제 없음). self 프로필 편집 폼을 연다. 양 모드 공통.
  const selfSwipeActions: SwipeAction[] = onEditSelf
    ? [
        {
          key: 'edit',
          icon: Pencil,
          label: t('friends.editTitle'),
          onPress: onEditSelf,
        },
      ]
    : [];

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
      // 관리 모드 = '분류' 관리(태그 관리가 '태그' 타이틀을 쓰는 것과 미러). 선택 모드 = 분류 변경.
      title={manage ? t('friends.title') : t('chat.menu.editCategory')}
      onClose={onClose}
      // 타이틀 [+] = 분류 추가 모달(태그 픽커와 같은 자리·같은 문법).
      onAdd={onAdd}
      addLabel={t('friends.addTitle')}
      cancelLabel={t('common.cancel')}
      // 관리 모드는 선택·저장 없이 밑줄 [닫기] 하나만.
      saveLabel={manage ? t('common.close') : t('common.save')}
      onSave={manage ? onClose : onSave}
      saving={manage ? false : saving}
      closeOnly={manage}
      // "목록" 섹션 헤더는 PickerModal이 스크롤 밖(고정)에 렌더한다. 접힘 키·개수만 넘긴다.
      listExpanded={listExpanded}
      onToggleListExpanded={() => toggleCollapsed('picker.categories')}
      listCount={localFriends.length}
      scrollToKey={scrollTarget}
      // 목록 드래그 순서 변경 — 선택·관리 모드 공통(모드 차이는 푸터만). 대상 행은 PickerReorderRow로 감싼다.
      // onActivate = 꾹 눌렀다 이동 없이 뗀 승격 탭의 행 동작(관리=수정 폼, 선택=분류 선택).
      reorder={{
        order: localFriends.map((f) => f.id),
        onReorder: onReorderFriends,
        onActivate: (id) => {
          if (manage) {
            const f = localFriends.find((x) => x.id === id);
            if (f && onEditFriend) onEditFriend(f);
          } else {
            select(id);
          }
        },
        // 행 더블탭(웹 더블클릭) = 수정 모달(스와이프 [수정]과 같은 경로). manage·선택 모드 공통.
        onEditRequest: onEditFriend
          ? (id) => {
              const f = localFriends.find((x) => x.id === id);
              if (f) onEditFriend(f);
            }
          : undefined,
      }}
      // 타이틀 오른쪽 휴지통 = 전체 삭제. 항목이 없으면 숨긴다.
      titleAccessory={
        localFriends.length > 0 ? (
          <TouchableOpacity
            onPress={() => void onDeleteAll()}
            disabled={deletingAll}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('friends.deleteAllTitle')}
          >
            <Trash2 size={18} strokeWidth={2} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null
      }
    >
      {manage ? (
        // 관리 모드: 최상단 "전체" 프로필 행(탭·스와이프 [수정] = self 편집) + 읽기 전용 분류 목록(추가만).
        <>
          {/* 픽커에서 '전체' 행 숨김(요청) — 필요시 주석 해제 */}
          {/* <PickerReorderRow rowKey={ALL_KEY} swipeActions={selfSwipeActions}>
            <CategoryManageRow
              name={t('chats.myRoom')}
              description={allSubtitle}
              color={selfColor}
              scrollKey={ALL_KEY}
              onEdit={onEditSelf}
            />
          </PickerReorderRow> */}
          {/* 빈 목록 안내는 태그 픽커(tags.empty)와 같은 문법 — 탭 화면용 emptyHint(2줄 큰 안내)가
              아니라 타이틀 [+]를 가리키는 한 줄. */}
          {listExpanded &&
            (localFriends.length === 0 ? (
              <Text variant="caption" color={colors.textTertiary} style={styles.emptyHint}>
                {t('friends.empty')}
              </Text>
            ) : (
              localFriends.map((friend) => (
                <PickerReorderRow
                  key={friend.id}
                  rowKey={friend.id}
                  swipeActions={swipeActionsFor(friend)}
                >
                  <CategoryManageRow
                    name={friend.name}
                    description={friend.description ?? null}
                    color={friend.color ?? null}
                    scrollKey={friend.id}
                    onEdit={onEditFriend ? () => onEditFriend(friend) : undefined}
                  />
                </PickerReorderRow>
              ))
            ))}
        </>
      ) : (
        <>
          {/* 픽커에서 '전체' 행 숨김(요청) — 필요시 주석 해제 */}
          {/* <PickerReorderRow rowKey={ALL_KEY} swipeActions={selfSwipeActions}>
            <PickerRow
              tile={<CategoryAvatar color={selfColor} size={PICKER_TILE_SIZE} />}
              label={t('chats.myRoom')}
              description={allSubtitle}
              selected={currentFriendId === null}
              onPress={() => select(null)}
              multi={false}
              scrollKey={ALL_KEY}
            />
          </PickerReorderRow> */}
          {listExpanded &&
            (localFriends.length === 0 ? (
              // 관리 모드·태그 픽커와 같은 빈 목록 안내 — 모드별 분기로 문법이 갈리지 않게.
              <Text variant="caption" color={colors.textTertiary} style={styles.emptyHint}>
                {t('friends.empty')}
              </Text>
            ) : (
              localFriends.map((friend) => (
                <PickerReorderRow
                  key={friend.id}
                  rowKey={friend.id}
                  swipeActions={swipeActionsFor(friend)}
                >
                  <PickerRow
                    tile={<CategoryAvatar color={friend.color ?? null} size={PICKER_TILE_SIZE} />}
                    label={friend.name}
                    description={friend.description ?? null}
                    selected={currentFriendId === friend.id}
                    onPress={() => select(friend.id)}
                    multi={false}
                    scrollKey={friend.id}
                  />
                </PickerReorderRow>
              ))
            ))}
        </>
      )}
    </PickerModal>
  );
}

// 관리 모드 행 — 선택 픽커 행(PickerRow)과 같은 여백/타일 정렬. 탭 = 수정 폼(색·프로필), 삭제·수정은 스와이프.
// 스크롤 타깃 offset 등록은 바깥 래퍼(PickerReorderRow)가 담당한다(스크롤 콘텐츠 기준 정확도).
function CategoryManageRow({
  name,
  description,
  color,
  scrollKey,
  onEdit,
  accessibilityActions,
  onAccessibilityAction,
}: {
  name: string;
  description: string | null;
  color: string | null;
  scrollKey: string;
  /** 있으면 행 탭 = 수정 폼 열기(스와이프 [수정]과 같은 동작). */
  onEdit?: () => void;
  /** 스크린리더 대안: 스와이프 액션(PickerReorderRow가 cloneElement로 주입). */
  accessibilityActions?: SwipeActionsA11y['accessibilityActions'];
  onAccessibilityAction?: SwipeActionsA11y['onAccessibilityAction'];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 스크롤 타깃 offset 등록은 바깥 래퍼(PickerReorderRow)가 담당한다(스크롤 콘텐츠 기준 정확도).
  // 드래그 세션 직후 따라오는 click을 눌러 무시(순서만 바꿨는데 수정 폼이 새는 누수 방지).
  const dragGuarded = usePickerReorderGuard();
  // 스와이프 드래그 직후 오탭 무시 + 열린 행 탭 = 닫기(본 목록과 같은 규칙).
  const swipeGuarded = usePickerSwipeTapGuard(scrollKey);
  return (
    <View style={styles.manageRow}>
      {/* 행 전체 탭 = 수정 진입(선택 픽커 행의 눌림 피드백과 같은 surface 채움). */}
      <Pressable
        style={({ pressed }) => [styles.manageTap, pressed && styles.manageTapActive]}
        onPress={() => {
          if (dragGuarded()) return;
          if (swipeGuarded()) return;
          onEdit?.();
        }}
        disabled={!onEdit}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityActions={accessibilityActions}
        onAccessibilityAction={onAccessibilityAction}
      >
        <CategoryAvatar color={color} size={PICKER_TILE_SIZE} />
        <View style={styles.manageLabelCol}>
          <Text variant="body" numberOfLines={1}>
            {name}
          </Text>
          {description ? (
            <Text variant="caption" color={colors.textTertiary} numberOfLines={1}>
              {description}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    emptyHint: {
      marginTop: 2,
      lineHeight: 18,
    },
    // 관리 모드 행 — 선택 픽커 행과 같은 여백/타일 정렬. [탭 영역][휴지통]으로 나뉜다.
    manageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: PICKER_TILE_SIZE + 12,
      paddingVertical: 6,
      paddingHorizontal: 6,
      marginHorizontal: -6,
    },
    // 타일+이름 탭 영역(수정 진입) — 눌림 = surface 채움(선택 픽커 행과 같은 문법).
    manageTap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 6,
      marginVertical: -6,
    },
    manageTapActive: {
      backgroundColor: colors.surface,
    },
    manageLabelCol: {
      flex: 1,
      marginLeft: 12,
      paddingRight: 8,
    },
  });
