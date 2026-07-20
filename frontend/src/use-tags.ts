import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, Tag } from './api';
import { errorText } from './i18n/errors';
import { confirmDialog, notify } from './notify';

// 태그 CRUD 공용 훅 — 태그 선택 모달(TagPickerModal)과 태그 탭/보드가 공유한다.
// 목록 상태 + 서버 호출(생성·수정·삭제)을 한 곳에 모아 화면마다 로직을 복붙하지 않는다.
// 실패는 code 번역(errorText)이나 공용 알림으로 노출한다. 호출부는 반환값으로
// 자기 고유 상태(선택 집합·라우팅 등)를 추가로 반영한다.
export function useTagCrud(token: string | null) {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>([]);

  const reload = useCallback(() => {
    if (!token) return;
    api.listTags(token).then(setTags).catch(() => {});
  }, [token]);

  // 생성 성공 시 만들어진 Tag를 반환(없으면 null). 이름 중복은 409 code로 번역 노출.
  const addTag = useCallback(
    async (name: string): Promise<Tag | null> => {
      const trimmed = name.trim();
      if (!trimmed || !token) return null;
      try {
        const created = await api.createTag(token, trimmed);
        setTags((prev) => [...prev, created]);
        return created;
      } catch (e) {
        notify(t('common.notice'), errorText(e));
        return null;
      }
    },
    [token, t],
  );

  // 이름 수정 성공 시 갱신된 Tag를 반환(변화 없거나 실패면 null).
  const renameTag = useCallback(
    async (tag: Tag, name: string): Promise<Tag | null> => {
      const trimmed = name.trim();
      if (!trimmed || !token || trimmed === tag.name) return null;
      try {
        const updated = await api.updateTag(token, tag.id, trimmed);
        setTags((prev) => prev.map((x) => (x.id === tag.id ? updated : x)));
        return updated;
      } catch (e) {
        notify(t('common.notice'), errorText(e));
        return null;
      }
    },
    [token, t],
  );

  // 삭제 확인 다이얼로그 → 성공 시 true. "모든 메시지에서 제거됩니다" 확인.
  const removeTag = useCallback(
    async (tag: Tag): Promise<boolean> => {
      if (!token) return false;
      const ok = await confirmDialog({
        title: t('tags.deleteTitle'),
        message: t('tags.deleteMessage', { name: tag.name }),
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      });
      if (!ok) return false;
      try {
        await api.deleteTag(token, tag.id);
        setTags((prev) => prev.filter((x) => x.id !== tag.id));
        return true;
      } catch (e) {
        notify(t('common.notice'), errorText(e));
        return false;
      }
    },
    [token, t],
  );

  return { tags, setTags, reload, addTag, renameTag, removeTag };
}
