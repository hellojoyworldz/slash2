# backend — NestJS + TypeORM

루트 `AGENTS.md`(모노레포 실행·env·에러코드 계약)를 먼저 따르고, 여기서는 백엔드 전용 규칙.

## 스택 · 규칙

- NestJS + TypeORM(PostgreSQL).
- 개발은 `synchronize: true`(엔티티 바꾸면 스키마 자동 반영), **운영은 false + 마이그레이션**.
- 엔티티의 nullable union 컬럼은 타입을 명시할 것: `@Column({ type: 'varchar', nullable: true })`.
  (리플렉션이 `string | null` 같은 union을 추론 못 해 `Data type "Object"` 에러가 남.)

## 에러 응답 (다국어 계약)

- 사용자에게 보일 에러는 **언어중립 code**로 던진다:
  `throw new ConflictException({ code: 'email_taken', message: '한국어 폴백' })`.
- `message`는 폴백·로그·비앱 소비자용. 화면 표시는 프론트가 `errors.<code>`로 번역.
- 코드 추가 시 프론트 로케일(`frontend/src/i18n/locales/*`)의 `errors`에도 추가.
- 계정 존재 여부를 숨겨야 하는 곳(로그인·재설정)은 동일 code로 응답.

## 인증

- 소셜 + 이메일/비밀번호. `users`(계정) · `social_accounts`(소셜 연결) · `auth_tokens`(인증·재설정 토큰).
- 소셜 식별은 `provider + sub`. 검증된(`email_verified`) 같은 이메일이면 같은 계정으로 통합.
- 이메일 인증: **링크(강한 랜덤 토큰) + 6자리 코드(30분·5회 제한)** 둘 다 발급. 코드 검증은 로그인 세션에 묶는다.
- 토큰·코드는 해시로만 저장.

## 빌드

- 실행은 컨테이너 watch가 담당. 타입체크만 필요하면 `docker compose exec backend npx tsc --noEmit`.
- 호스트 `npm run build` 금지(루트 `AGENTS.md` 참고).

## 스키마 관리 (미배포 단계)

- 아직 운영 DB가 없으므로 **마이그레이션을 관리하지 않는다** — 엔티티만 고치면 dev synchronize가
  반영하고, dev 데이터는 밀어도 된다. 미리 마이그레이션 파일을 만들지 말 것(순수 오버헤드).
- **첫 배포 직전에 할 일**: 운영은 `synchronize:false`로 게이트하고, 그 시점 엔티티로 베이스라인
  마이그레이션 1개를 생성(빈 임시 DB에 `migration:generate`)해 부팅 시 자동 실행되게 구성한다.
  그 이후부터만 엔티티 변경에 마이그레이션을 짝지운다.
