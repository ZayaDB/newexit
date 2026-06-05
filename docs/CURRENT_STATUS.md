# NEW EXIT 현재 개발 상태

## 프로젝트 구조

```
Mobile/
├── backend/          # Node.js + Express + MongoDB API
├── mobile/           # Expo (React Native) 앱
└── docs/             # 문서
```

## 실행 방법 (개발)

### 백엔드 (선택 — 오프라인 데모 시 불필요)

```bash
cd backend
npm install
npm run seed      # 데모 데이터
npm run dev       # http://localhost:3001
```

### 모바일 앱

```bash
cd mobile
npm install
npx expo start --lan --go -c --port 8082
```

iPhone Expo Go (SDK 54)에서 같은 Wi-Fi로 연결.

### 데모 계정

| 필드 | 값 |
|------|-----|
| 이메일 | buyer@newexit.mn |
| 전화 | +97699112233 |
| 비밀번호 | demo1234 |

## 환경변수 (mobile/.env)

```env
EXPO_PUBLIC_API_URL=http://192.168.0.86:3001/api
EXPO_PUBLIC_OFFLINE_DEMO=1
```

- `OFFLINE_DEMO=1`: 서버 없이 앱 내 목데이터로 동작
- `OFFLINE_DEMO=0`: 실제 API 서버 사용

## 구현된 화면

- [x] 로그인/회원가입
- [x] 홈 (배너, 카테고리, 추천상품)
- [x] 검색
- [x] 상품 목록/상세
- [x] 상품 등록
- [x] 결제
- [x] 배송 추적
- [x] 메시지 (UI 목업)
- [x] 프로필

## 기술 스택

| 영역 | 기술 |
|------|------|
| 모바일 | Expo SDK 54, React Native, TypeScript |
| 백엔드 | Node.js, Express, Mongoose |
| DB | MongoDB (로컬) |
| 인증 | JWT (이메일/전화) |

## 알려진 제한

- Expo Go 개발 모드: PC에서 `expo start` 실행 중이어야 앱 로드됨
- SNS 로그인: UI만, 미연동
- 결제: mock (실제 PG 없음)
- 채팅: 목업 UI
- 이미지 업로드: 데모 URL 사용

## 다음 단계

- [ARCHITECTURE_PLAN.md](./ARCHITECTURE_PLAN.md) — Spring Boot + PostgreSQL + 집 서버 계획 (코딩 전 합의)
- [PRODUCTION_LAUNCH_GUIDE.md](./PRODUCTION_LAUNCH_GUIDE.md) — 실서비스·앱스토어·비용
