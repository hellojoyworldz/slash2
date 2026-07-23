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
