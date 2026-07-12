# 개발 환경 실행 가이드

클론 받은 뒤 로컬에서 실행하는 방법

## 구조

```
slash2/
├── .env               # 환경변수 (루트에서 관리, .env.example 참고)
├── docker-compose.yml # PostgreSQL (+ 배포용 backend 컨테이너)
├── backend/           # NestJS API 서버 (포트 4000)
├── frontend/          # Expo 앱 — iOS·Android·웹 (포트 8081)
└── desktop/           # Electron 데스크탑 앱 (frontend 웹 빌드를 감쌈)
```

## 사전 준비

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (DB 실행용)
- Node.js 20 이상
- (폰에서 볼 때) [Expo Go](https://expo.dev/go) 앱

## 빠른 시작

```bash
cp .env.example .env        # 처음 한 번만
docker compose up --build
```

이 한 줄로 **DB + 백엔드 + 프론트가 전부 도커 컨테이너로** 뜬다.

- **프론트엔드**: http://localhost:8081
- **백엔드 API**: http://localhost:4000/api
- 소스 코드가 컨테이너에 볼륨 마운트되어 있어 **수정하고 저장하면 바로 반영**된다 (핫 리로드)
- `--build`는 패키지(`package.json`)가 바뀌었을 때만 필요. 평소엔 `docker compose up`
- 끄기: `Ctrl+C` 또는 `docker compose down`

> **폰(Expo Go)으로 테스트할 때만 예외**: QR 스캔 연결은 컨테이너 안에서 안 되므로,
> 프론트만 로컬에서 실행한다 → `docker compose up -d db backend` 후 `cd frontend && npx expo start`

## 하나씩 실행하기 (수동)

### 1. 환경변수 만들기

```bash
cp .env.example .env
```

기본값 그대로 로컬 개발이 가능하다.

### 2. DB 켜기

```bash
docker compose up -d db
```

- PostgreSQL 16이 `localhost:5432`에 뜬다 (계정/비번/DB 모두 `app`)
- 데이터는 `pgdata` 볼륨에 저장되므로 컨테이너를 내려도 유지된다
- 그 외 Docker 명령은 아래 [Docker 사용법](#docker-사용법) 참고

### 3. 백엔드 켜기

```bash
cd backend
npm install        # 처음 한 번만
npm run start:dev  # 코드 저장 시 자동 재시작 (개발용)
```

- API: http://localhost:4000/api
- 개발 모드에서는 TypeORM `synchronize`가 켜져 있어 테이블이 자동 생성된다

### 4. 프론트엔드 켜기

```bash
cd frontend
npm install        # 처음 한 번만
npx expo start
```

- **웹**: http://localhost:8081 접속 (또는 터미널에서 `w` 입력)
- **폰**: 터미널의 QR 코드를 Expo Go로 스캔 (컴퓨터와 같은 와이파이여야 함 —
  API 주소는 Expo 개발 서버 IP를 따라 자동으로 잡힌다)

## 데스크탑 앱 (Electron)

DB와 백엔드가 켜져 있어야 한다 (위 2·3번). 그 다음:

```bash
cd desktop
npm install          # 처음 한 번만

# 방법 A: 개발 모드 — Expo 개발 서버(8081)를 창에 띄움 (핫리로드 O)
#         frontend에서 npx expo start가 켜져 있어야 함
npm run dev

# 방법 B: 실행 모드 — 정적 웹 빌드를 감싸서 실행 (개발 서버 불필요)
npm run build:web    # frontend를 dist로 빌드 (프론트 코드가 바뀔 때마다)
npm start
```

창을 닫아도 메뉴 바(화면 위 오른쪽 "/" 아이콘)에 상주한다.
완전히 끄려면 메뉴 바 아이콘 → 종료.

## 자주 쓰는 명령

```bash
# 백엔드
cd backend
npm run start:dev            # 개발 서버 (자동 재시작)
npm run build && npm run start:prod   # 빌드 후 실행

# 프론트엔드
cd frontend
npx expo start               # 개발 서버
npx expo start --clear       # 캐시 문제가 있을 때
npx tsc --noEmit             # 타입 체크
```

## Docker 사용법

```bash
docker compose up            # 전체(DB+백엔드+프론트) 실행
docker compose up --build    # 패키지가 바뀌었을 때 (이미지 재빌드)
docker compose up -d db      # DB만 백그라운드로
docker compose down          # 전부 정지 (데이터는 유지)
docker compose down -v       # 전부 정지 + 데이터 완전 삭제 (주의!)
docker compose ps            # 상태 확인
docker compose logs -f backend    # 특정 서비스 로그 보기 (db/backend/frontend)
docker compose exec db psql -U app app   # DB 콘솔(psql) 접속
```

### psql 접속 후 유용한 명령

```sql
\dt                         -- 테이블 목록
SELECT * FROM users;        -- 유저 확인
SELECT * FROM friends;      -- 친구(카테고리) 확인
SELECT * FROM messages ORDER BY "createdAt" DESC LIMIT 10;  -- 최근 메시지
\q                          -- 나가기
```

### 운영 배포 참고

`docker-compose.yml`은 로컬 개발용(핫 리로드) 구성이다. 운영 배포 시에는
`backend/Dockerfile`의 최종 스테이지(프로덕션 빌드)를 그대로 쓰면 된다:

```bash
docker build -t slash-backend ./backend   # 프로덕션 이미지
```

운영에서는 `JWT_SECRET`을 반드시 바꿀 것.

### Docker 문제 해결

```bash
# 5432 포트가 이미 사용 중이라고 뜰 때 (로컬에 다른 Postgres가 있는 경우)
lsof -i :5432

# DB가 안 뜨거나 상태가 이상할 때: 로그 확인
docker compose logs db

# 완전 초기화 (데이터 다 지우고 처음부터)
docker compose down -v && docker compose up -d db
```

## 환경변수

루트 `.env`에서 관리한다. 항목은 `.env.example` 참고.

| 변수          | 설명                                              |
| ------------- | ------------------------------------------------- |
| `PORT`        | 백엔드 포트 (기본 4000)                           |
| `CORS_ORIGIN` | 허용할 웹 주소, 콤마로 여러 개 (기본에 8081 포함) |
| `DATABASE_*`  | PostgreSQL 접속 정보                              |
| `JWT_SECRET`  | 로그인 토큰 서명 키 — 운영에서는 반드시 변경      |
