# NEW EXIT

몽골·한국 거주 몽골인을 위한 중고거래 + 배송 슈퍼앱 (iOS 목표, Expo 기반)

## 구성

- `backend/` — Node.js + Express + MongoDB API
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
2. **MongoDB** 로컬 (`mongodb://127.0.0.1:27017`)
3. **Expo Go** 앱 (휴대폰 테스트) 또는 Android 에뮬레이터

### MongoDB 설치 (Windows)

[MongoDB Community Server](https://www.mongodb.com/try/download/community) 설치 후 서비스 시작.

또는 Docker:

```bash
docker run -d --name newexit-mongo -p 27017:27017 mongo:7
```

## 실행 방법

### 1. 백엔드

```bash
cd backend
npm install
npm run seed    # 데모 데이터 + 계정 생성
npm run dev     # http://localhost:3001
```

**데모 계정** (비밀번호: `demo1234`)

- `buyer@newexit.mn` — 구매자
- `seller@newexit.mn` — 판매자
- `mover@newexit.mn` — 배송기사

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

## 기술 선택 이유

- **Expo**: Windows에서 개발 가능, iOS 빌드는 Mac/EAS로 진행
- **MongoDB**: 요청하신 로컬 DB 테스트
- **Node.js API**: 빠른 CRUD, JWT 인증

## 다음 단계 (실서비스 전)

1. SNS OAuth (Kakao, Google, Apple)
2. SMS OTP (Twilio 등)
3. 실제 PG (Z-Pay, 카드)
4. S3/Cloudinary 이미지 업로드
5. WebSocket 채팅
6. 지도 SDK (실시간 트래킹)
