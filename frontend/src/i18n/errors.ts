import { ApiError } from '../api';
import i18n from './index';

// 백엔드 ApiError를 현재 언어의 사용자 문구로 변환한다.
// code가 있고 매칭되는 번역이 있으면 그걸, 아니면 일반 실패 문구.
export function errorText(error: unknown): string {
  if (error instanceof ApiError && error.code && i18n.exists(`errors.${error.code}`)) {
    return i18n.t(`errors.${error.code}`);
  }
  return i18n.t('errors.requestFailed');
}
