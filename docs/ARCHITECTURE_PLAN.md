# NEW EXIT 아키텍처·운영 계획

> UI/디자인은 현재 모바일 앱 그대로 유지  
> 백엔드는 Spring Boot + PostgreSQL로 재구축  
> 서버는 집에서 24시간 운영 (이후 필요 시 클라우드 이전)

**문서 목적:** 코딩 전 방향 합의 · 백엔드 학습·운영 기준 정리

---

## 1. 현재 상태

| 구분 | 상태 |
|------|------|
| 모바일 UI/UX | ✅ 완료 — **공통 디자인으로 고정** |
| 모바일 기술 | Expo SDK 54, React Native, TypeScript |
| 기존 API | Node.js + Express + MongoDB (`backend/`) — **레거시** |
| 데모 모드 | `EXPO_PUBLIC_OFFLINE_DEMO=1` (서버 없이 동작) |
| 배포 | Expo Go 개발 모드 (PC에서 `expo start` 필요) |

### 모바일 디자인 시스템 (유지)

- 색상: `mobile/src/theme/colors.ts`
- 컴포넌트: Button, Input, ProductCard, CategoryRow, ScreenHeader 등
- 화면 플로우: 로그인 → 홈 → 상품 → 등록 → 결제 → 배송 추적
- **앞으로 UI 변경 최소화, API·백엔드만 교체**

---

## 2. 목표 아키텍처

```
┌─────────────────┐
│  iOS 앱 (Expo)   │  ← 디자인·화면 유지
│  mobile/         │
└────────┬────────┘
         │ HTTPS/HTTP
         │ /api/*
         ▼
┌─────────────────┐
│  Spring Boot     │  ← 새 백엔드 (학습·운영)
│  backend-spring/ │
│  포트: 8080      │
└────────┬────────┘
         │ JDBC
         ▼
┌─────────────────┐
│  PostgreSQL      │  ← 단일 DB (1단계)
│  포트: 5432      │
│  (집 서버 로컬)   │
└─────────────────┘
```

### 왜 Spring Boot + PostgreSQL?

| 선택 | 이유 |
|------|------|
| **Spring Boot** | 백엔드 학습에 표준, 레이어 구조 명확, 취업·실무와 동일 |
| **PostgreSQL** | 회원·주문·결제·정산에 관계형·트랜잭션 적합 |
| **MongoDB (보류)** | 채팅·로그 등 필요해지면 2단계에서 추가 검토 |

---

## 3. DB 선택: PostgreSQL vs MongoDB

| | PostgreSQL | MongoDB |
|---|------------|---------|
| 회원·주문·결제 | ✅ 적합 | △ 가능하나 트랜잭션 약함 |
| Spring Boot 연동 | JPA (표준 학습 경로) | MongoTemplate (추가 학습) |
| 집 서버 운영 | 설치·백업 절차 명확 | 로컬 또는 Atlas |
| 중고거래 + 정산 | **권장** | 보조 용도 |

### 결정 (제안)

- **1단계:** PostgreSQL **단독** — users, categories, products, orders, deliveries
- **2단계 이후:** 채팅·대량 로그 필요 시 MongoDB **추가** (선택)

처음부터 두 DB를 쓰면 집 서버 관리·학습 부담이 커짐.

---

## 4. Spring Boot 패키지 구조 (이해하기 쉬운 레이어)

```
kr.co.newexit
├── NewExitApplication.java
├── config/              # Security, CORS, JWT 설정
├── controller/          # HTTP — 요청 받고 응답만 (얇게)
├── dto/
│   ├── request/         # API 입력
│   └── response/        # API 출력 (Entity 직접 노출 X)
├── domain/
│   ├── entity/          # DB 테이블 = JPA Entity
│   ├── enums/           # Role, OrderStatus 등
│   └── repository/      # DB 접근 (JpaRepository)
├── service/             # 비즈니스 로직
├── security/            # JWT 발급·검증
└── common/
    ├── exception/       # 통일된 에러 처리
    └── response/        # ApiResponse 래퍼 (선택)
```

### 레이어별 역할

| 레이어 | 하는 일 | 하지 않는 일 |
|--------|---------|--------------|
| **Controller** | URL 매핑, DTO 변환, HTTP 상태코드 | 비즈니스 로직, SQL |
| **Service** | 로그인, 주문 생성, 가격 계산 | HTTP 헤더 직접 다루기 |
| **Repository** | DB CRUD | 비즈니스 규칙 |
| **Entity** | 테이블 구조 | API JSON 그대로 노출 |

---

## 5. API 설계 (모바일 호환)

기존 앱이 쓰는 경로를 **최대한 유지** → 모바일 수정 최소화.

| Method | Path | 설명 |
|--------|------|------|
| POST | `/api/auth/login/email` | 이메일 로그인 |
| POST | `/api/auth/login/phone` | 전화 로그인 |
| POST | `/api/auth/register` | 회원가입 |
| GET | `/api/auth/me` | 내 정보 (JWT) |
| GET | `/api/categories` | 카테고리 목록 |
| GET | `/api/products` | 상품 목록 (필터·정렬) |
| GET | `/api/products/{id}` | 상품 상세 |
| POST | `/api/products` | 상품 등록 |
| POST | `/api/orders` | 주문·결제 생성 |
| GET | `/api/orders/{id}` | 주문 상세 |
| GET | `/api/deliveries/order/{orderId}` | 배송 추적 |
| GET | `/api/health` | 서버 상태 |

### JSON 필드 호환

기존 모바일은 MongoDB 스타일 `_id` 사용.

- Response DTO에서 `@JsonProperty("_id")` 또는 동일 필드명 유지
- 점진적으로 `id` 통일 가능

---

## 6. 집 서버 24시간 운영

### 구성 (예시)

| 구성요소 | 포트 | 외부 노출 |
|----------|------|-----------|
| Spring Boot API | **8080** | ✅ (앱이 접속) |
| PostgreSQL | **5432** | ❌ (로컬만, 보안) |

### 반드시 알아둘 것

| 항목 | 설명 |
|------|------|
| **공인 IP / DDNS** | 집 IP가 바뀌면 앱 연결 끊김 → DDNS(무료) 또는 고정 IP |
| **방화벽** | 8080만 개방, 5432는 외부 차단 |
| **HTTPS** | 실서비스·앱스토어 전에는 HTTP로 베타 가능, 출시 전 HTTPS 권장 |
| **백업** | PostgreSQL `pg_dump` 스케줄 (매일) |
| **전기·재부팅** | 서버 다운 = 앱 전체 다운 → UPS·자동 재시작 고려 |

### 모바일 앱 연결 설정

```env
# mobile/.env (집 서버 연결 시)
EXPO_PUBLIC_API_URL=http://<집서버IP또는DDNS>:8080/api
EXPO_PUBLIC_OFFLINE_DEMO=0
```

- 같은 Wi-Fi: `http://192.168.x.x:8080/api`
- 외부(4G): DDNS + 포트포워딩 또는 나중에 HTTPS 도메인

### 집 서버 vs 클라우드

| | 집 서버 | 클라우드 |
|---|---------|----------|
| 비용 | 전기 + 인터넷 | 월 1~5만원~ |
| 적합 | 베타·본인 학습·소수 사용자 | 사용자 증가·24h 안정성 |
| 권장 시점 | Phase 1~2 | Phase 3~ (출시·확장) |

---

## 7. 프로젝트 폴더 구조 (제안)

```
Mobile/
├── mobile/                 # Expo 앱 (UI 유지)
├── backend/                # Node.js — 레거시 (참고용, 이후 제거 가능)
├── backend-spring/         # ★ 새 Spring Boot API
├── docs/
│   ├── ARCHITECTURE_PLAN.md    # 이 문서
│   ├── PRODUCTION_LAUNCH_GUIDE.md
│   └── CURRENT_STATUS.md
└── README.md
```

**결정 필요:** `backend-spring/` 신규 생성 vs `backend/` 교체  
→ **권장:** `backend-spring/` 신규 (기존 Node와 비교·이전 중 참고)

---

## 8. 단계별 로드맵

### Phase 0 — 현재 ✅

- Expo Go + 오프라인 데모
- UI/플로우 완성

### Phase 1 — Spring + PostgreSQL (집 서버)

- [ ] Java 17 + Spring Boot 3 프로젝트 생성
- [ ] PostgreSQL 설치 (집 PC)
- [ ] Entity: User, Category, Product
- [ ] JWT 로그인/회원가입
- [ ] 상품 목록·상세·등록 API
- [ ] 모바일 `OFFLINE_DEMO=0` + 집 서버 URL 연결
- [ ] 시드 데이터 (데모 계정)

**비용:** 0원 (집 PC + PostgreSQL 무료)

### Phase 2 — 주문·배송·이미지

- [ ] Order, Delivery Entity
- [ ] 주문·배송 API
- [ ] 이미지 업로드 (로컬 폴더 또는 MinIO/S3)
- [ ] 에러 처리·로깅 통일

### Phase 3 — 설치형 앱

- [ ] Apple Developer ($99/년)
- [ ] EAS iOS 빌드 → TestFlight
- [ ] 이용약관·개인정보 URL (집 서버 또는 정적 페이지)

### Phase 4 — 실결제·정식 운영

- [ ] 사업자·PG
- [ ] HTTPS (nginx + Let's Encrypt)
- [ ] (선택) 도메인
- [ ] (선택) 클라우드 이전

---

## 9. 비용 요약 (운영자 기준)

### 집 서버 + Spring + PostgreSQL (Phase 1~2)

| 항목 | 비용 |
|------|------|
| Spring Boot / PostgreSQL | **0원** |
| 집 서버 전기·인터넷 | 기존 사용분 |
| 도메인 | **선택** (연 1~2만원) |
| **합계** | **거의 0원** |

### 앱스토어 설치까지 (Phase 3)

| 항목 | 비용 |
|------|------|
| Apple Developer | **연 약 14만원** |

### 실결제 서비스 (Phase 4)

| 항목 | 비용 |
|------|------|
| PG 수수료 | 매출의 2.5~3.5% |
| 법무 검토 | 30~100만원 (1회) |
| HTTPS·도메인 | 연 1~2만원 + |

---

## 10. 코딩 전에 정할 것 (체크리스트)

| # | 항목 | 제안 | 결정 |
|---|------|------|------|
| 1 | DB | PostgreSQL 단독 (1단계) | ☐ |
| 2 | 백엔드 폴더 | `backend-spring/` 신규 | ☐ |
| 3 | 집 서버 OS | Windows / Linux | ☐ |
| 4 | Phase 1 범위 | 로그인 + 상품 CRUD | ☐ |
| 5 | Java 경험 | 패키지·주석 수준 조절 | ☐ |
| 6 | Node `backend/` | 레거시 유지 후 제거 | ☐ |

---

## 11. 대충 하면 안 되는 것

| 항목 | 이유 |
|------|------|
| Entity를 API에 그대로 노출 | DB 구조 변경 시 앱 깨짐 |
| PostgreSQL 5432 외부 개방 | 해킹·데이터 유출 |
| mock 결제를 실결제처럼 표시 | 법적·스토어 리스크 |
| 백업 없이 운영 | DB 날리면 서비스 종료 |
| 오프라인 데모와 실 API 혼용 | 버그·혼란 |

---

## 12. 다음 단계 (합의 후)

1. 위 **체크리스트 6항** 확정
2. `docs/`에 DB 스키마 초안 추가 (선택)
3. `backend-spring/` Spring Boot 프로젝트 생성
4. Phase 1 API 구현 → 모바일 연동 테스트

---

## 13. 참고 문서

- [CURRENT_STATUS.md](./CURRENT_STATUS.md) — 현재 개발 상태
- [PRODUCTION_LAUNCH_GUIDE.md](./PRODUCTION_LAUNCH_GUIDE.md) — 실서비스·앱스토어·비용

---

*작성일: 2026-06-05*  
*상태: 코딩 전 설계·합의용*
