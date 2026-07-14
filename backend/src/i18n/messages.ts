// 백엔드가 직접 발신/렌더하는 콘텐츠(메일·HTML 페이지)의 다국어 문구.
// (앱 UI 문구는 프론트가, 에러는 코드로 → 여기는 서버 발신물 전용)

export type Locale = 'ko' | 'en' | 'ja';
const SUPPORTED: Locale[] = ['ko', 'en', 'ja'];
const DEFAULT: Locale = 'ko';

type Dict = Record<string, string>;

const messages: Record<Locale, Dict> = {
  ko: {
    'mail.verifySubject': '[slash] 이메일 인증을 완료해주세요',
    'mail.verifyIntro': '아래 인증 코드를 앱에 입력하거나, 링크를 눌러 인증을 완료해주세요.',
    'mail.verifyLinkText': '이메일 인증하기 (링크)',
    'mail.verifyExpire': '코드와 링크는 30분 뒤 만료됩니다.',
    'mail.resetSubject': '[slash] 비밀번호 재설정',
    'mail.resetIntro':
      '아래 인증 코드를 앱에 입력하거나, 링크를 눌러 비밀번호를 재설정하세요.',
    'mail.resetLinkText': '비밀번호 재설정하기 (링크)',
    'mail.resetIgnore':
      '본인이 요청하지 않았다면 이 메일을 무시하세요. 코드와 링크는 1시간 뒤 만료됩니다.',
    'page.verifyOkTitle': '이메일 인증 완료',
    'page.verifyOkMsg': '이메일 인증이 완료되었습니다. 앱으로 돌아가세요.',
    'page.verifyFailTitle': '인증 실패',
    'page.verifyFailMsg': '유효하지 않거나 만료된 링크입니다.',
    'page.resetTitle': '비밀번호 재설정',
    'page.resetDesc': '새 비밀번호를 입력하세요 (8자 이상).',
    'page.resetPlaceholder': '새 비밀번호',
    'page.resetButton': '변경하기',
    'page.resetOkTitle': '완료',
    'page.resetOkMsg': '비밀번호가 변경되었습니다. 앱에서 새 비밀번호로 로그인하세요.',
    'page.resetFailTitle': '실패',
    'page.resetFailMsg': '유효하지 않거나 만료된 링크입니다. 다시 요청해주세요.',
  },
  en: {
    'mail.verifySubject': '[slash] Verify your email',
    'mail.verifyIntro':
      'Enter the code below in the app, or tap the link to finish verifying.',
    'mail.verifyLinkText': 'Verify email (link)',
    'mail.verifyExpire': 'The code and link expire in 30 minutes.',
    'mail.resetSubject': '[slash] Password reset',
    'mail.resetIntro':
      'Enter the code below in the app, or tap the link to reset your password.',
    'mail.resetLinkText': 'Reset password (link)',
    'mail.resetIgnore':
      'If you didn’t request this, ignore this email. The code and link expire in 1 hour.',
    'page.verifyOkTitle': 'Email verified',
    'page.verifyOkMsg': 'Your email has been verified. You can return to the app.',
    'page.verifyFailTitle': 'Verification failed',
    'page.verifyFailMsg': 'This link is invalid or has expired.',
    'page.resetTitle': 'Reset password',
    'page.resetDesc': 'Enter a new password (8+ characters).',
    'page.resetPlaceholder': 'New password',
    'page.resetButton': 'Change',
    'page.resetOkTitle': 'Done',
    'page.resetOkMsg':
      'Your password has been changed. Log in with the new password in the app.',
    'page.resetFailTitle': 'Failed',
    'page.resetFailMsg': 'This link is invalid or has expired. Please request again.',
  },
  ja: {
    'mail.verifySubject': '[slash] メール認証を完了してください',
    'mail.verifyIntro':
      '下記の認証コードをアプリに入力するか、リンクをタップして認証を完了してください。',
    'mail.verifyLinkText': 'メールを認証（リンク）',
    'mail.verifyExpire': 'コードとリンクは30分後に失効します。',
    'mail.resetSubject': '[slash] パスワード再設定',
    'mail.resetIntro':
      '下記の認証コードをアプリに入力するか、リンクからパスワードを再設定してください。',
    'mail.resetLinkText': 'パスワードを再設定（リンク）',
    'mail.resetIgnore':
      '心当たりがない場合はこのメールを無視してください。コードとリンクは1時間後に失効します。',
    'page.verifyOkTitle': 'メール認証完了',
    'page.verifyOkMsg': 'メール認証が完了しました。アプリに戻ってください。',
    'page.verifyFailTitle': '認証失敗',
    'page.verifyFailMsg': 'リンクが無効か、期限切れです。',
    'page.resetTitle': 'パスワード再設定',
    'page.resetDesc': '新しいパスワードを入力してください（8文字以上）。',
    'page.resetPlaceholder': '新しいパスワード',
    'page.resetButton': '変更する',
    'page.resetOkTitle': '完了',
    'page.resetOkMsg':
      'パスワードを変更しました。アプリで新しいパスワードでログインしてください。',
    'page.resetFailTitle': '失敗',
    'page.resetFailMsg': 'リンクが無効か、期限切れです。もう一度お試しください。',
  },
};

// Accept-Language 또는 앱이 보낸 값에서 지원 언어를 뽑는다. 없으면 기본(ko).
export function resolveLocale(raw?: string): Locale {
  const code = (raw || '').split(',')[0].trim().slice(0, 2).toLowerCase();
  return (SUPPORTED as string[]).includes(code) ? (code as Locale) : DEFAULT;
}

export function tr(locale: string, key: string): string {
  const loc = (SUPPORTED as string[]).includes(locale)
    ? (locale as Locale)
    : DEFAULT;
  return messages[loc][key] ?? messages[DEFAULT][key] ?? key;
}
