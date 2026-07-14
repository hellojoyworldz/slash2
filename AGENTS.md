# slash2

나에게 보내는 링크/메세지를 정리하는 앱. Expo(React Native) 프론트 + NestJS/PostgreSQL 백엔드 모노레포.

## Orchestration

You are the orchestrator.

- Plan tasks and synthesize final results.
- Delegate reasoning-heavy work to `deep-reasoner`.
- Delegate routine and mechanical work to `fast-worker`.
- Avoid large implementation work yourself.

## 구조

- `frontend/` — Expo(React Native), expo-router. 웹/iOS/안드로이드 공용.
- `backend/` — NestJS + TypeORM(PostgreSQL).
- `docker-compose.yml` — db · backend · frontend · mailpit.
- 도메인별 규칙은 `backend/AGENTS.md`, `frontend/AGENTS.md` 참고.

## 실행 (Docker)

- `docker compose up -d` 로 전체 기동 (db·backend·frontend·mailpit).
- **의존성은 컨테이너 안에서 설치**: `docker compose exec <svc> npm install`.
  node_modules가 named volume이라 호스트 `npm install`은 컨테이너에 반영되지 않는다.
- **호스트에서 `npm run build`(nest build) 금지**: 백엔드 `dist/`가 볼륨 공유라
  컨테이너의 실행 파일을 덮어써 크래시난다(`Cannot find module '/app/dist/main'`).
  타입체크는 `docker compose exec backend npx tsc --noEmit`, 실행은 컨테이너 watch에 맡길 것.

## 환경변수

- 레포 **루트 `.env` 하나**를 backend·frontend가 공유(compose `env_file`). `frontend/.env` 따로 두지 말 것.
- `EXPO_PUBLIC_*` 값만 앱 번들에 노출된다.

## 프론트 ↔ 백 계약: 에러 코드

- 백엔드는 **언어중립 `code`**를 던지고(`throw new XException({ code, message })`),
  프론트가 `errors.<code>`로 번역한다. **UI 문구를 백엔드가 완성하지 않는다**(다국어 앱이라).

## 메일

- 개발: **Mailpit**(`http://localhost:8025`)이 가로챈다. 실제 발송 안 됨, 가입·키 불필요.
- 배포: `.env`의 `MAIL_*`를 Resend/SES 등으로 교체(코드는 그대로).

## 백엔드 발신물 다국어

- 인증메일·재설정메일·인증/재설정 **HTML 페이지**는 ko/en/ja 지원. 사전은 `backend/src/i18n/messages.ts`.
- 언어 전달: 앱이 모든 요청에 **`X-App-Lang: <ko|en|ja>`** 헤더를 붙인다(`frontend/src/api.ts`).
  백엔드가 이 값으로 `users.locale`을 갱신·저장한다.
- 메일 링크에는 **`&lang=<locale>`**을 심어, 브라우저에서 열리는 HTML 페이지도 맞는 언어로 렌더.
- 예외: DTO의 class-validator 검증 메시지는 아직 한국어(프론트가 자체 검증해 거의 노출 안 됨).
