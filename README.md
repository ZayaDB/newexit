# NEW EXIT

몽골·한국 거주 몽골인을 위한 중고거래 + 배송 슈퍼앱 (iOS 목표, Expo 기반)

## 구성

- `backend/` — Node.js + Express API, DB는 Supabase (Postgres)
- `supabase/` — DB 스키마와 기본 카테고리 (`migrations/`)
- `mobile/` — Expo (React Native) iOS/Android 앱

## 우리가 지금 구현한 것

| 기능 | 상태 |
|------|------|
| 이메일/전화 로그인·회원가입 | ✅ 실제 API + JWT |
| SNS 로그인 (Kakao/Google/Apple) | ⏳ UI만 (나중에 연동) |
| 홈, 검색, 상품 목록/상세 | ✅ API 연동 |
| 상품 등록 | ✅ API 연동 (이미지는 데모 URL) |
| 결제 | ✅ 주문 생성 (실제 PG 없음, mock 결제) |
| 배송 추적 | ✅ 타임라인 + 기사 정보 |
| 채팅, 실시간 지도, SMS OTP | ⏳ UI/플레이스홀더 |

## 사전 준비

1. **Node.js** 18+
2. **Supabase 프로젝트** `newexit` (서울 리전, 테이블 이미 생성됨)
3. **Expo Go** 앱 (휴대폰 테스트) 또는 Android 에뮬레이터

## 실행 방법

### 1. 백엔드

```bash
cd backend
cp .env.example .env   # Windows: copy .env.example .env
```

`.env`에 두 가지를 채워요:

- `DATABASE_URL` — 백엔드 전용 DB 계정 `newexit_api`로 접속 (`supabase/migrations/20261102000000_backend_api_role.sql` 참고). 형식: `postgresql://newexit_api.<project-ref>:<비밀번호>@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres`
- `JWT_SECRET` — `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` 결과 붙여넣기

```bash
npm install
npm run db:check   # DB 연결 확인 (pooler 주소가 틀리면 자동으로 고쳐줌)
npm run dev        # http://localhost:3001  →  /api/health 에서 database: ok 확인
```

빈 DB에 테이블·카테고리 만들기: `npm run db:setup` (새 DB에서 한 번만)
전체 API 테스트: `npm test` (테스트용 계정·상품을 만들었다가 끝나면 지움)

계정은 앱에서 회원가입으로 만들어요. 배송기사(`mover`)·관리자(`admin`) 권한은 Supabase 대시보드 → Table Editor → `users`에서 `role`을 바꿔 주세요.

### 2. 모바일 앱

```bash
cd mobile
npm install
npm start
```

- **Android 에뮬레이터**: API 자동 (`10.0.2.2:3001`)
- **실제 기기**: PC IP로 `mobile/.env` 생성

```env
EXPO_PUBLIC_API_URL=http://192.168.x.x:3001/api
```

- **iOS**: Mac + Xcode 또는 Expo EAS Build 필요 (Windows에서는 Expo Go로 iOS 실기기 테스트 가능)

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login/email` | 이메일 로그인 |
| POST | `/api/auth/login/phone` | 전화 로그인 |
| POST | `/api/auth/register` | 회원가입 |
| GET | `/api/products` | 상품 목록 |
| GET | `/api/products/:id` | 상품 상세 |
| POST | `/api/products` | 상품 등록 (인증) |
| POST | `/api/orders` | 주문/결제 (인증) |
| GET | `/api/deliveries/order/:orderId` | 배송 추적 |
| GET | `/api/deliveries/tracking/:trackingNumber` | 송장번호로 배송 추적 |
| GET | `/api/orders/:id` | 주문 상세 (구매자·판매자·기사만) |
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/auth/me` | 내 정보 |
| GET | `/api/health` | 서버·DB 상태 |

## 기술 선택 이유

- **Expo**: Windows에서 개발 가능, iOS 빌드는 Mac/EAS로 진행
- **Supabase (Postgres)**: 관리형 DB, 나중에 Storage(이미지)·Realtime(채팅)도 같은 곳에서 사용 가능
- **Node.js API**: 빠른 CRUD, JWT 인증

## 다음 단계 (실서비스 전)

1. SNS OAuth (Kakao, Google, Apple)
2. SMS OTP (Twilio 등)
3. 실제 PG (Z-Pay, 카드)
4. Supabase Storage 이미지 업로드
5. WebSocket 채팅
6. 지도 SDK (실시간 트래킹)
