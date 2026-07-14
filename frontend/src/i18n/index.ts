import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import ja from './locales/ja';
import ko from './locales/ko';

export const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

// 스위처에 표시할 언어 이름 (각 언어의 자기 표기 = endonym).
export const LANGUAGE_NAMES: Record<Language, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
};

const STORAGE_KEY = 'slash.lang';

// 기기 언어를 감지해 지원 언어면 사용, 아니면 영어로 폴백.
function detectDeviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
    ? (code as Language)
    : 'en';
}

// getLocales()가 동기라 앱 렌더 전에 초기화가 끝난다.
void i18n.use(initReactI18next).init({
  resources: {
    ko: { translation: ko },
    en: { translation: en },
    ja: { translation: ja },
  },
  lng: detectDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // RN은 XSS 대상이 아니라 이스케이프 불필요
});

// 사용자가 예전에 고른 언어가 있으면 적용 (기기 언어보다 우선).
export async function loadStoredLanguage(): Promise<void> {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (
      saved &&
      (SUPPORTED_LANGUAGES as readonly string[]).includes(saved) &&
      saved !== i18n.language
    ) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // 저장소 접근 실패는 무시하고 기기 언어를 유지한다.
  }
}

// 수동 스위처에서 호출: 언어를 바꾸고 선택을 저장한다.
export async function setLanguage(lang: Language): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // 저장 실패해도 현재 세션 언어는 바뀐 상태로 둔다.
  }
}

export default i18n;
