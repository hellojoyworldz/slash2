import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Pencil, Star, StarOff, Trash2 } from 'lucide-react-native';
import { api, Message, Tag } from '../api';
import { useCollapsedSections } from '../collapsed-sections';
import { errorText } from '../i18n/errors';
import { confirmDialog, notify } from '../notify';
import { useSelectedRoom } from '../selected-room';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import { useTagCrud } from '../use-tags';
import { HashTile } from './HashTile';
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
  /** 타이틀 [+] — 루트 상주 태그 추가 모달(tag-create `openTagAdd`)을 연다. 픽커는 목록 전용이라
   *  추가 폼을 직접 들지 않는다(분류 픽커 onAddFriend 미러). 호출부가 세션을 열고,
   *  생성되면 onCreated로 만들어진 태그를 돌려준다 — 픽커가 목록에 얹고 그 항목으로 스크롤한다. */
  onAddTag: (onCreated: (tag: Tag) => void) => void;
  /** 수정 모드 스테이징: true면 [저장]이 PATCH 대신 고른 tagIds를 onPicked로 돌려주고 닫는다.
   *  (태그 생성 "+추가"는 스테이징과 무관하게 즉시 — 목록에 떠야 하니. 이 메시지엔 선택만 반영.) */
  staged?: boolean;
  /** 스테이징 모드 [저장] 시 고른 태그 목록을 호출자에게 돌려준다. */
  onPicked?: (tagIds: string[]) => void;
  /** 관리 모드: 메시지 컨텍스트 없이 태그를 "추가"하는 전용 모드(그룹의 태그 캡슐 +·태그 탭 +).
   *  선택 체크 없이 태그 목록 + 상단 '새 태그 이름' 인라인 추가 + [닫기]만 둔다(관리는 태그 탭 몫). */
  manage?: boolean;
  /** 관리 모드 행 탭 시 그 태그의 이름·설명 수정 폼을 연다(선택 모드엔 넘기지 않음 — 행 탭=선택 유지). */
  onEditTag?: (tag: Tag) => void;
  /** "태그 전체" 방 프로필 색(hex) — 최상단 전체 행 # 타일 배경. */
  tagAllColor?: string | null;
  /** "태그 전체" 방 설명 — 전체 행 부제(없으면 '전체 메시지 보기'). */
  tagAllDescription?: string | null;
  /** "태그 전체" 프로필(색·설명) 편집 폼을 연다. 있으면 전체 행에 스와이프 [수정] + 관리 모드 탭이 붙는다. */
  onEditTagAll?: () => void;
}

// 최상단 "전체" 행의 스크롤/재정렬 제외 key 센티널(태그가 아니라 프로필 행).
const TAG_ALL_KEY = '__tagall__';

// 태그 선택 픽커 — 분류 픽커와 한 문법(PickerModal 골격 + PickerRow 행). **목록 전용**이다:
// 신규 생성은 타이틀 [+]가 여는 루트 상주 추가 모달(tag-create) 몫이고, 여기엔 추가 폼이 없다.
// "고르기 → 저장": 내 태그 목록 멀티 선택을 로컬로 고르고(PATCH 없음), 푸터 [저장]에서만
// tagIds 전체를 PATCH. 행 = [# 타일][이름], 선택 = surface 채움(체크 아이콘 없음).
export function TagPickerModal({
  visible,
  token,
  message,
  onClose,
  onSaved,
  onTagsChanged,
  onAddTag,
  staged,
  onPicked,
  manage = false,
  onEditTag,
  tagAllColor,
  tagAllDescription,
  onEditTagAll,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 태그 목록·삭제는 공용 훅에서. 여기선 멀티 선택·저장만 얹는다(생성은 루트 상주 추가 모달 몫).
  const { tags, setTags, reload, removeTag } = useTagCrud(token);
  // 수정 폼(루트 상주)이 이름·설명을 바꾸거나 삭제하면 bumpRooms → roomsVersion으로 목록 재로드.
  const { roomsVersion } = useSelectedRoom();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  // 전체 삭제 진행 중 — 중복 클릭 방지(타이틀 휴지통).
  const [deletingAll, setDeletingAll] = useState(false);
  // 스크롤 타깃 — 열릴 때 첫 선택 태그, 추가 직후 새 태그. PickerModal이 이 key로 스크롤.
  const [scrollTarget, setScrollTarget] = useState<string | null>(null);
  // '목록' 섹션 접힘 상태 — 서버 저장(픽커 전용 키, 본 목록과 독립). 재진입해도 접힘이 유지된다.
  const { isCollapsed, toggle: toggleCollapsed } = useCollapsedSections();
  const listExpanded = !isCollapsed('picker.tags');

  // 열릴 때(또는 대상 변경 시): 태그 목록 fetch + 대상 메시지의 현재 태그로 선택 초기화.
  useEffect(() => {
    if (!visible || !token) return;
    const init = new Set(message?.tagIds ?? []);
    setSelected(init);
    // 선택된 태그가 있으면(목록 순서상 첫 번째) 열릴 때 그 항목으로 스크롤(길면 화면 밖일 수 있어).
    setScrollTarget(init.size > 0 ? [...init][0] : null);
    // 접힘 상태는 서버 저장이라 열 때 리셋하지 않는다(재진입 시 유지 — 사용자 리포트한 버그 수정).
    reload();
  }, [visible, token, message?.id, reload]);

  // 열려 있는 동안 태그 변경 신호(roomsVersion)가 오면 목록을 재로드한다 —
  // 관리 픽커 행 탭으로 연 수정 폼이 이름·설명 저장/삭제 후 리스트에 즉시 반영되게.
  useEffect(() => {
    if (!visible || !token) return;
    reload();
  }, [roomsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // 행 탭 = 로컬 선택만 토글. PATCH 없음(저장 때 한 번에 tagIds 전체 교체).
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 행 휴지통 — 확인창 → 태그 삭제(모든 메시지에서 제거, useTagCrud.removeTag가 확인창 포함).
  // 지운 태그가 선택되어 있었으면 선택에서도 뺀다.
  const onDeleteTag = async (tag: Tag) => {
    const ok = await removeTag(tag);
    if (!ok) return;
    setSelected((prev) => {
      if (!prev.has(tag.id)) return prev;
      const next = new Set(prev);
      next.delete(tag.id);
      return next;
    });
    onTagsChanged();
  };

  // 타이틀 [+] — 루트 상주 태그 추가 모달을 픽커 위에 연다(픽커는 열린 채 유지).
  // 생성되면 목록에 즉시 얹고 그 항목으로 스크롤, 선택 픽커면 새 태그를 체크 상태로 만든다.
  const onAdd = () => {
    onAddTag((created) => {
      setTags((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created]));
      onTagsChanged();
      if (!manage) setSelected((prev) => new Set(prev).add(created.id));
      // 새 항목으로 스크롤(목록 어디에 들어가든 보이게).
      setScrollTarget(created.id);
      // 접힌 상태로 추가하면 새 항목이 안 보이니 자동으로 펼친다(접혀 있을 때만 토글).
      if (isCollapsed('picker.tags')) toggleCollapsed('picker.tags');
    });
  };

  // 타이틀 휴지통 — 확인창 → 모든 태그를 모든 메시지에서 제거. 선택도 비운다.
  const onDeleteAll = async () => {
    if (!token || deletingAll || tags.length === 0) return;
    const ok = await confirmDialog({
      title: t('tags.deleteAllTitle'),
      message: t('tags.deleteAllMessage'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    setDeletingAll(true);
    try {
      for (const tag of tags) {
        await api.deleteTag(token, tag.id);
      }
      setTags([]);
      setSelected(new Set());
      onTagsChanged();
    } catch (e) {
      notify(t('common.notice'), errorText(e));
    } finally {
      setDeletingAll(false);
    }
  };

  // 목록 드래그 재정렬 커밋 — 본 목록(태그)과 같은 순서 계약(tags 순서 API). 낙관 반영 후 서버 저장,
  // 성공하면 onTagsChanged로 본 화면 목록을 동기화. 실패하면 서버 순서로 복원(reload).
  // 픽커 목록 정렬 = useTagCrud(listTags, position ASC)로 본 목록과 동일 정렬.
  const onReorderTags = useCallback(
    (ids: string[]) => {
      const byId = new Map(tags.map((x) => [x.id, x]));
      const next = ids
        .map((id) => byId.get(id))
        .filter((x): x is Tag => x != null);
      if (next.length !== tags.length) return;
      setTags(next);
      if (!token) return;
      api
        .reorderTags(token, ids)
        .then(() => onTagsChanged())
        .catch(() => {
          reload();
          onTagsChanged();
        });
    },
    [tags, setTags, reload, token, onTagsChanged],
  );

  // 즐겨찾기(★) 토글 — 본 목록(TagsScreen)과 같은 낙관 갱신 계약: 고정(pinned)과는 무관한 별개
  // 표시이고 본 목록(태그) 정렬엔 영향 없다. 별 추가 시 즐겨찾기 섹션 맨 밑(현재 최대
  // favoritePosition+1)에 오도록 값을 부여, 해제 시 null. 성공하면 onTagsChanged로 본 화면 목록을
  // 동기화하고, 실패하면 reload로 서버 상태를 되돌린 뒤 onTagsChanged로 재동기화(onReorderTags 실패
  // 처리와 같은 revert 계약 — 조용히 삼키지 않는다).
  const onToggleFavorite = (tag: Tag) => {
    if (!token) return;
    const nextFavorite = !tag.favorite;
    const maxPos = tags.reduce(
      (m, x) =>
        x.favorite && x.favoritePosition != null ? Math.max(m, x.favoritePosition) : m,
      -1,
    );
    setTags((prev) =>
      prev.map((x) =>
        x.id === tag.id
          ? { ...x, favorite: nextFavorite, favoritePosition: nextFavorite ? maxPos + 1 : null }
          : x,
      ),
    );
    api
      .updateTagFavorite(token, tag.id, nextFavorite)
      .then(() => onTagsChanged())
      .catch(() => {
        reload();
        onTagsChanged();
      });
  };

  // 행 왼→오 스와이프 액션 [즐겨찾기][삭제][수정] — 본 목록(태그 탭)과 완전히 같은 문법·순서.
  // 즐겨찾기 = 토글(이미 즐겨찾기면 해제), 수정 = 이름·설명·프로필 색 폼(관리 모드 onEditTag /
  // 선택 모드도 props로 이관받아 동일 동작), 삭제 = 기존 휴지통과 같은 계약(onDeleteTag가
  // removeTag의 confirmDialog 포함). 선택·관리 모드 공통.
  const swipeActionsFor = (tag: Tag): SwipeAction[] => [
    {
      key: 'favorite',
      icon: tag.favorite ? StarOff : Star,
      label: tag.favorite ? t('a11y.unfavorite') : t('a11y.favorite'),
      onPress: () => onToggleFavorite(tag),
    },
    {
      key: 'delete',
      icon: Trash2,
      label: t('tags.removeLabel', { name: tag.name }),
      onPress: () => void onDeleteTag(tag),
    },
    ...(onEditTag
      ? [
          {
            key: 'edit',
            icon: Pencil,
            label: t('tags.editTitle'),
            onPress: () => onEditTag(tag),
          },
        ]
      : []),
  ];

  // "전체" 행 부제 — 커스텀 설명(tagAllDescription)이 있으면 그것, 없으면 '전체 메시지 보기'(전체 부제 공통 키).
  const allSubtitle = tagAllDescription || t('friends.sendToMe');
  // "전체" 행 스와이프 — [수정]만(삭제 없음). 태그 전체 프로필 편집 폼을 연다. 양 모드 공통.
  const tagAllSwipeActions: SwipeAction[] = onEditTagAll
    ? [
        {
          key: 'edit',
          icon: Pencil,
          label: t('tags.editTitle'),
          onPress: onEditTagAll,
        },
      ]
    : [];
  // "전체" 프로필 행(양 모드 공통) — # 타일 + '전체' + 부제. 관리 모드 탭 = 편집, 선택 모드 탭 = 무동작.
  // 스와이프 [수정]은 양 모드 공통. 재정렬·삭제 대상 아님(order 밖 rowKey).
  const tagAllRow =
    tagAllColor !== undefined || onEditTagAll ? (
      <PickerReorderRow rowKey={TAG_ALL_KEY} swipeActions={tagAllSwipeActions}>
        <TagManageRow
          name={t('chats.myRoom')}
          color={tagAllColor ?? null}
          description={allSubtitle}
          scrollKey={TAG_ALL_KEY}
          onEdit={manage ? onEditTagAll : undefined}
        />
      </PickerReorderRow>
    ) : null;

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
      // 타이틀 [+] = 태그 추가 모달(분류 픽커와 같은 자리·같은 문법).
      onAdd={onAdd}
      addLabel={t('tags.addTitle')}
      cancelLabel={t('common.cancel')}
      // 관리 모드는 선택·저장 없이 밑줄 [닫기] 하나만(스크림·Esc·뒤로가기도 동일하게 닫힌다).
      saveLabel={manage ? t('common.close') : t('common.save')}
      onSave={manage ? onClose : onSave}
      saving={manage ? false : saving}
      closeOnly={manage}
      // "목록" 섹션 헤더는 PickerModal이 스크롤 밖(고정)에 렌더한다. 접힘 키·개수만 넘긴다.
      listExpanded={listExpanded}
      onToggleListExpanded={() => toggleCollapsed('picker.tags')}
      listCount={tags.length}
      scrollToKey={scrollTarget}
      // 목록 드래그 순서 변경 — 선택·관리 모드 공통(모드 차이는 푸터만). 대상 행은 PickerReorderRow로 감싼다.
      // onActivate = 꾹 눌렀다 이동 없이 뗀 승격 탭의 행 동작(관리=수정 폼, 선택=태그 토글).
      reorder={{
        order: tags.map((x) => x.id),
        onReorder: onReorderTags,
        onActivate: (id) => {
          if (manage) {
            const tag = tags.find((x) => x.id === id);
            if (tag && onEditTag) onEditTag(tag);
          } else {
            toggle(id);
          }
        },
        // 행 더블탭(웹 더블클릭) = 수정 모달(스와이프 [수정]과 같은 경로). manage·선택 모드 공통.
        onEditRequest: onEditTag
          ? (id) => {
              const tag = tags.find((x) => x.id === id);
              if (tag) onEditTag(tag);
            }
          : undefined,
      }}
      // 타이틀 오른쪽 휴지통 = 전체 삭제. 항목이 없으면 숨긴다.
      titleAccessory={
        tags.length > 0 ? (
          <TouchableOpacity
            onPress={() => void onDeleteAll()}
            disabled={deletingAll}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={t('tags.deleteAllTitle')}
          >
            <Trash2 size={18} strokeWidth={2} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null
      }
    >
      {/* 픽커에서 '전체' 행 숨김(요청) — 필요시 주석 해제 */}
      {/* {tagAllRow} */}
      {listExpanded &&
        (tags.length === 0 ? (
          <Text variant="caption" color={colors.textTertiary} style={styles.emptyHint}>
            {t('tags.empty')}
          </Text>
        ) : manage ? (
          // 관리 모드: 선택 체크 없이 읽기 전용 목록(추가만). 관리(수정·삭제·고정·순서)는 태그 탭 몫.
          tags.map((tag) => (
            <PickerReorderRow key={tag.id} rowKey={tag.id} swipeActions={swipeActionsFor(tag)}>
              <TagManageRow
                name={tag.name}
                color={tag.color ?? null}
                description={tag.description ?? null}
                scrollKey={tag.id}
                onEdit={onEditTag ? () => onEditTag(tag) : undefined}
              />
            </PickerReorderRow>
          ))
        ) : (
          tags.map((tag) => (
            <PickerReorderRow key={tag.id} rowKey={tag.id} swipeActions={swipeActionsFor(tag)}>
              <PickerRow
                tile={<HashTile color={tag.color ?? null} />}
                label={tag.name}
                description={tag.description ?? null}
                selected={selected.has(tag.id)}
                onPress={() => toggle(tag.id)}
                multi
                scrollKey={tag.id}
              />
            </PickerReorderRow>
          ))
        ))}
    </PickerModal>
  );
}

// 관리 모드 행 — 선택 픽커 행과 같은 여백/타일 정렬. 탭 = 이름·설명·프로필 색 폼, 삭제·수정은 스와이프.
// 스크롤 타깃 offset 등록은 바깥 래퍼(PickerReorderRow)가 담당한다(스크롤 콘텐츠 기준 정확도).
function TagManageRow({
  name,
  color,
  description,
  scrollKey,
  onEdit,
  accessibilityActions,
  onAccessibilityAction,
}: {
  name: string;
  color: string | null;
  description: string | null;
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
        <HashTile color={color} />
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
