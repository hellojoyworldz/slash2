import { tr } from '../i18n/messages';

// 메일 링크로 열리는 아주 단순한 HTML 페이지들. (Expo 라우팅을 건드리지 않으려고
// 백엔드가 직접 응답한다.) 언어는 링크의 ?lang= 값으로 결정한다.

const shell = (title: string, inner: string) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;background:#fafafa;color:#111;
    display:flex;min-height:100vh;margin:0;align-items:center;justify-content:center}
  .card{background:#fff;border:1px solid #eee;border-radius:16px;padding:32px;
    max-width:360px;width:100%;box-sizing:border-box;text-align:center}
  h1{font-size:20px;margin:0 0 12px}
  p{color:#555;font-size:14px;line-height:1.6;margin:0 0 16px}
  input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #ddd;
    border-radius:10px;font-size:15px;margin-bottom:12px}
  button{width:100%;padding:12px;border:0;border-radius:10px;background:#111;color:#fff;
    font-size:15px;font-weight:600;cursor:pointer}
</style></head><body><div class="card">${inner}</div></body></html>`;

// 결과 안내 페이지. titleKey/msgKey는 i18n 키.
export const page = (locale: string, titleKey: string, msgKey: string) =>
  shell(tr(locale, titleKey), `<h1>${tr(locale, titleKey)}</h1><p>${tr(locale, msgKey)}</p>`);

// 비밀번호 입력 폼. 제출 시 lang을 hidden으로 함께 보내 결과 페이지 언어를 유지.
export const resetForm = (token: string, locale: string) =>
  shell(
    tr(locale, 'page.resetTitle'),
    `<h1>${tr(locale, 'page.resetTitle')}</h1>
     <p>${tr(locale, 'page.resetDesc')}</p>
     <form method="post" action="/api/auth/reset-password">
       <input type="hidden" name="token" value="${escapeAttr(token)}" />
       <input type="hidden" name="lang" value="${escapeAttr(locale)}" />
       <input type="password" name="password" placeholder="${tr(locale, 'page.resetPlaceholder')}"
              minlength="8" required autofocus />
       <button type="submit">${tr(locale, 'page.resetButton')}</button>
     </form>`,
  );

// value/속성에 들어가는 값의 따옴표 깨짐 방지.
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
