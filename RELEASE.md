# 앱 출시 체크리스트

iOS App Store 우선, Google Play 병행 대비. 완료 시 체크.

## 1. 심사 필수 기능 (코드)

- [x] **app.json 정비** — 이름·iOS 번들ID(placeholder, 확정 필요)·빌드넘버·스플래시·`userInterfaceStyle: automatic`(다크모드)·ko/en/ja 로케일 선언·암호화 면제 신고
- [x] **더보기 앱 정보 섹션** — 버전 표시·오픈소스 라이선스 화면(직접 의존성 33개, 데스크톱 오른쪽 패널)
- [x] **개인정보처리방침·이용약관 인앱 페이지** — `/privacy`·`/terms` 독립 전체 페이지(ko/en/ja 초안). 웹 배포 시 이 주소가 스토어 제출용 공개 URL이 됨. **남은 것: 문의 이메일·시행일 placeholder 교체 + 법률 검토**
- [ ] **Sign in with Apple** — Google 소셜 로그인이 있으므로 필수 (가이드라인 4.8). 미제공 시 리젝 *(참고: Kakao는 아직 미구현 — env 키만 존재)*
- [ ] **계정 삭제(회원탈퇴)** — 앱 안에서 완결돼야 함 (가이드라인 5.1.1(v)). 백엔드 삭제 API + 더보기 UI
- [ ] **개인정보처리방침·이용약관** — 문서 작성(ko/en/ja) + 웹 호스팅 + 앱·스토어 연결
- [ ] (Play 대비) 계정 삭제 **웹 링크**도 Google Play 데이터 안전 섹션에서 요구됨

## 2. 인프라 — 첫 배포 (backend/AGENTS.md 계획 트리거)

- [ ] 백엔드 공개 **HTTPS** 배포 — iOS ATS가 http 기본 차단
- [ ] DB: `synchronize:false` 전환 + 베이스라인 마이그레이션 1개 생성
- [ ] 메일: Mailpit → Resend/SES (`.env MAIL_*` 교체)
- [ ] `frontend/src/api.ts` BASE_URL을 배포 주소로
- [ ] `.env` 운영 비밀값 재발급 (JWT_SECRET 등)

## 3. 소셜 로그인 네이티브 설정

- [ ] Google **iOS/Android 클라이언트 ID** 발급 → `EXPO_PUBLIC_GOOGLE_{IOS,ANDROID}_CLIENT_ID` (현재 빈 값)
- [ ] Kakao 개발자콘솔에 iOS/Android 앱 등록 + 리다이렉트(scheme) 설정
- [ ] Apple 로그인용 키·Service ID 발급 (백엔드 토큰 검증)

## 4. 빌드·제출 체계

- [ ] Apple Developer Program 가입 (연 $99)
- [ ] 번들 ID 확정 (현재 placeholder — app.json 참고)
- [ ] EAS Build 설정 (`eas.json`) — Expo Go로는 Apple 로그인 등 테스트 불가, dev build 전환 시점
- [ ] TestFlight 내부 테스트

## 5. App Store Connect 제출물

- [ ] 앱 이름·부제·설명·키워드 (ko/en/ja 현지화)
- [ ] 스크린샷 — iPhone 6.9″/6.5″ + **iPad**(supportsTablet: true라 iPad도 심사·스크린샷 대상)
- [ ] 1024×1024 아이콘 (투명도 불가)
- [ ] 개인정보처리방침 URL + **App Privacy 라벨**(수집 데이터 신고: 이메일·메모 콘텐츠 등)
- [ ] 심사용 테스트 계정 제공 (로그인 필수 앱이라 요구됨)
- [ ] 연령 등급 설문

## 6. 품질·운영 (권장, 리젝 사유 아님)

- [ ] 크래시 리포팅 (Sentry 등)
- [ ] OTA 업데이트 (EAS Update) — JS 수정을 심사 없이 배포
- [x] 접근성 (스크린리더·reduce-motion·라벨) — 2026-07 완료
- [x] 다크모드·ko/en/ja 다국어 — 완료

## 7. 데스크톱(맥·윈도우) 배포 절차

`desktop/`은 `frontend/dist`(Expo Web 정적 export)를 electron-serve로 감싼 메뉴바 상주형 셸이다.
`electron-builder`로 설치 파일을 만든다 (무서명 — 코드 서명·공증/Authenticode는 이 범위 밖).
빌드는 **맥 호스트 한 대에서 맥·윈도우 산출물을 모두** 만들 수 있다(electron-builder의 크로스 빌드 지원).

### 공통 전제

- **백엔드가 공개 HTTPS로 배포돼 있어야 한다.** 데스크톱 앱은 정적 웹 빌드라 로컬 백엔드에 의존할 수 없다.
- **백엔드 `CORS_ORIGIN`에 `app://-` 포함 필수.** 데스크톱(Electron) 앱의 내부 오리진이라,
  빠지면 데스크톱 앱의 모든 API 호출(이메일·구글 로그인 포함)이 CORS로 차단된다.
  증상: 구글 브라우저 창은 "로그인 완료"까지 가는데 앱은 "구글 로그인에 실패했습니다".
- **`EXPO_PUBLIC_API_URL`을 배포된 백엔드 주소로 설정**하고 웹 빌드해야 한다(루트 `.env` 또는 빌드 시 환경변수).
  예: `EXPO_PUBLIC_API_URL=https://api.slash.example`.
  **미설정 시 `http://localhost:4000/api`로 폴백** — 이 경우 로컬 개발용 빌드만 된다 (배포용 아님).
- 최초 1회 `cd desktop && npm install` (호스트에서, `electron-builder` devDependency 포함).
- 아이콘은 `desktop/appicon.png`(1024×1024, 라운드 타일+투명 여백)에서 맥·윈도우 둘 다 생성한다
  (아래 "데스크톱 구글 로그인"은 선택 — 키가 없으면 구글 버튼만 숨겨지고 나머지 빌드는 그대로 진행된다):
  (`gen-app-icon.mjs`, macOS 전용 `sips`/`iconutil` 사용):
  - `desktop/build/icon.icns` — macOS(`iconutil`로 정식 생성).
  - `desktop/build/icon.ico` — Windows. macOS엔 png→ico 네이티브 변환기가 없어, `sips`로 뽑은
    16~256px PNG들을 표준 "PNG-in-ico"(Vista+ 지원) 컨테이너로 직접 패킹한다(순수 Node, 외부 도구 불필요).

### 데스크톱 구글 로그인 (선택 — 데스크톱 앱 유형 OAuth)

데스크톱 셸의 "Google로 계속하기"는 웹/모바일과 다른 경로다. Google Cloud Console에서 만든
**"데스크톱 앱" 유형** OAuth 클라이언트로, 시스템 브라우저 + `127.0.0.1` 루프백 콜백 + PKCE를
쓴다(웹 클라이언트 ID가 아니다). 시크릿은 렌더러에 내려가지 않고 코드→토큰 교환도 전부
Electron 메인 프로세스에서 끝난다. 최종 산출물은 백엔드가 이미 검증하는 `id_token` 하나라
기존 `POST /auth/social/google` 경로를 그대로 탄다.

전제:

1. **루트 `.env`에 두 키 추가**:
   - `GOOGLE_DESKTOP_CLIENT_ID=<데스크톱 앱 클라이언트 ID>`
   - `GOOGLE_DESKTOP_CLIENT_SECRET=<데스크톱 앱 클라이언트 시크릿>`
   (Console → 사용자 인증 정보 → OAuth 클라이언트 ID → 애플리케이션 유형 **"데스크톱 앱"**.
   루프백 리다이렉트는 포트 무관하게 허용되므로 별도 리다이렉트 URI 등록은 필요 없다.)
2. **백엔드 `GOOGLE_CLIENT_IDS` 허용 목록에 이 데스크톱 클라이언트 ID를 추가**하고 backend를 재기동.
   (백엔드가 `id_token`의 `aud`를 이 목록으로 검증한다. 추가 안 하면 로그인은 뜨지만 백엔드가 거절.)
3. 빌드 시 `predist`가 `gen-oauth-config.mjs`를 돌려 `.env`의 두 키를 `desktop/google-oauth.json`으로
   구워 `extraResources`에 동봉한다. 이 json은 **시크릿이라 `.gitignore` 대상**이고 커밋하지 않는다.

키가 **없어도 빌드는 그대로 진행**된다 — 빈 `google-oauth.json`이 생성되고, 앱은 런타임에
"미설정"으로 판단해 **구글 버튼만 숨긴다**(이메일/비번 로그인은 정상). dev 실행(`npm run dev`,
`ELECTRON_DEV=1`)에서는 json 대신 루트 `.env`를 직접 읽는다.

### macOS 빌드

```sh
cd desktop
EXPO_PUBLIC_API_URL=https://api.slash.example npm run dist
```

`npm run dist`는 다음을 순서대로 수행한다 (`predist` 훅):

1. `build:web` — `frontend`에서 `expo export --platform web` 실행 → `frontend/dist` 생성
   (이때 `EXPO_PUBLIC_API_URL`이 웹 번들에 박힌다).
2. `gen-icon:icns` — `gen-app-icon.mjs` 실행, `desktop/build/icon.icns`·`icon.ico`를 함께 생성.
3. `gen-oauth` — `gen-oauth-config.mjs` 실행, `.env`의 `GOOGLE_DESKTOP_*`를 `desktop/google-oauth.json`으로
   구워 `extraResources`에 동봉(키가 비어 있으면 빈 json + 경고, 빌드는 계속).
4. `electron-builder`(기본 인자 없음 → 호스트와 같은 플랫폼, 즉 macOS만 빌드) 실행 —
   `frontend/dist`를 `extraResources`로 앱 번들 `Resources/dist`에 복사하고
   (asar 밖이라 electron-serve가 패키징 후에도 그대로 읽는다) dmg + zip(arm64)을 만든다.

산출물:

- `desktop/dist/slash-<version>-arm64.dmg` — 배포용 설치 이미지.
- `desktop/dist/slash-<version>-arm64-mac.zip` — 배포용 압축 앱.
- `desktop/dist/mac-arm64/slash.app` — 압축 풀린 앱 번들 (스모크 테스트용).

무서명 앱 실행 우회 (배포받는 사용자 안내) — Apple Developer 서명이 없어 Gatekeeper가 처음 실행을 막는다:

1. dmg를 열어 `slash.app`을 Applications로 드래그.
2. Finder에서 `slash.app`을 **우클릭 → 열기** → 경고 창에서 다시 "열기" 선택
   (더블클릭으로 열면 "손상되었다"는 메시지와 함께 실행이 거부된다. 우클릭 경로만 예외를 허용한다).
3. 이후부터는 더블클릭으로 정상 실행된다.

검증(스모크 테스트) — 패키징된 앱이 정상적으로 웹 빌드를 로드하는지, 앱을 직접 열지 않고 확인:

```sh
SMOKE_TEST=1 ./dist/mac-arm64/slash.app/Contents/MacOS/slash
```

`SMOKE_OK`가 출력되고 프로세스가 스스로 종료하면 정상. `main.js`가 `SMOKE_TEST=1`일 때
로드 성공 직후 `app.quit()`하도록 이미 훅이 들어가 있다.

### Windows 빌드 (맥 호스트에서 크로스 빌드)

```sh
cd desktop
EXPO_PUBLIC_API_URL=https://api.slash.example npm run dist:win
```

`npm run dist:win`은 `build:web` → `gen-icon:icns` → `gen-oauth`(`predist:win` 훅) → `electron-builder --win` 순으로
NSIS 설치기(.exe)와 portable(.exe)을 x64로 만든다. 필요한 nsis/7zip 등 빌드 도구는 electron-builder가
자동으로 내려받으며 wine 없이도 동작한다(맥에서 검증 완료).

산출물:

- `desktop/dist/slash Setup <version>.exe` — NSIS 설치기 (배포용, 기본).
- `desktop/dist/slash <version>.exe` — portable 실행 파일 (설치 없이 바로 실행, 선택 배포용).
- `desktop/dist/win-unpacked/slash.exe` — 압축 풀린 실행 파일 (참고용, exe 자체는 Windows에서만 실행 가능).

아이콘은 `build/icon.ico`가 NSIS 설치기·uninstaller·portable exe·앱 exe 전부에 임베드된다
(맥에서는 exe를 직접 실행해 눈으로 확인할 수 없어, PE 리소스에 `icon.ico`의 PNG 바이트가
그대로 박혀 있는지 바이너리 비교로 검증했다 — 아래 "검증" 참고).

**무서명이라 SmartScreen 경고가 뜬다.** Authenticode 서명 인증서가 없으므로 실행 시
"Windows의 PC 보호" 화면이 뜬다. 배포받는 사용자 안내:

1. 설치기(`slash Setup <version>.exe`) 실행 시 SmartScreen이 막으면
   **"추가 정보"(More info) 클릭 → 하단에 나타나는 "실행"(Run anyway) 클릭**.
2. 브라우저(Edge/Chrome)로 받은 경우 다운로드 목록에서 파일 우클릭 → "차단 해제/유지" 후 위 절차 진행.
3. 배포량이 늘수록 SmartScreen 평판이 쌓여 경고가 줄어들지만, 근본 해결은 아래 서명 TODO.

검증(맥 호스트 한계) — 맥에서는 exe를 실행할 수 없으므로 다음까지만 확인한다:

- `desktop/dist/`에 `.exe`(설치기·portable) 산출 여부·용량.
- `desktop/dist/win-unpacked/slash.exe` 등 압축 해제 결과물 존재.
- 아이콘 임베드 여부: `build/icon.ico`에서 뽑은 PNG 바이트열이 산출 exe 안에 그대로 존재하는지
  Node 스크립트로 바이너리 검색 (electron-builder가 rcedit 없이도 리소스에 아이콘을 심는지 확인하는 용도).
- 실제 실행·SmartScreen 문구·설치 마법사 동작은 Windows 머신에서 별도 확인 필요(이번 검증 범위 밖).

### 빌드 산출물 위치 요약

| 플랫폼 | 명령 | 주요 산출물 |
| --- | --- | --- |
| macOS (arm64) | `npm run dist` | `dist/*.dmg`, `dist/*-mac.zip` |
| Windows (x64) | `npm run dist:win` | `dist/*Setup*.exe`(NSIS), `dist/slash <ver>.exe`(portable) |

### 추후 TODO (서명·공증)

- [ ] macOS: Apple Developer ID Application 인증서로 코드 서명 (`mac.identity`를 null → 실제 identity로) +
      `notarize` 단계 추가(예: `@electron/notarize`) — 공증 안 하면 배포 규모가 커질수록
      Gatekeeper 경고가 사용자 경험을 해친다.
- [ ] macOS: `appId`(`com.app.slash.desktop`)를 Apple Developer 계정에 App ID로 등록.
- [ ] Windows: Authenticode 코드 서명 인증서 발급(EV 권장 — SmartScreen 평판이 즉시 쌓임) 후
      `win.certificateFile`/`CSC_LINK` 등으로 electron-builder에 연결.
- [ ] 자동 업데이트(맥 Sparkle / 윈도우 NSIS 업데이트 또는 electron-updater) 도입 여부 검토
      (현재는 매 배포마다 재설치 필요).
