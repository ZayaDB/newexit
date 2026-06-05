# NEW EXIT 실서비스 전환 가이드

> 현재 상태: UI/플로우 MVP 완료 (Expo Go 데모 + 로컬 API + 오프라인 데모 모드)  
> 목표: 합법적이고 안정적인 실서비스 운영 + App Store 출시

---

## 1. 현재 우리가 가진 것

| 구분 | 상태 | 비고 |
|------|------|------|
| 모바일 UI/UX | ✅ 완료 | 로그인, 홈, 상품, 결제, 배송추적 화면 |
| 백엔드 API 구조 | ✅ 초안 | Node.js + Express + MongoDB |
| 로컬 DB/시드 | ✅ 있음 | 개발/테스트용 |
| 오프라인 데모 모드 | ✅ 있음 | `EXPO_PUBLIC_OFFLINE_DEMO=1` |
| SNS 로그인 | ⏳ UI만 | Kakao/Google/Apple 미연동 |
| 실제 결제(PG) | ❌ 없음 | mock 결제만 |
| 클라우드 서버 | ❌ 없음 | PC 로컬 실행 |
| App Store 제출본 | ❌ 없음 | Expo Go 개발 모드만 |

---

## 2. 실서비스에 반드시 필요한 것 (핵심)

### 2.1 사업·법무 (합법 운영)

- [ ] **사업자 등록** (한국 기준, `newexit.co.kr` 운영 시)
- [ ] **몽골 현지 사업 구조** (몽골 사용자/물류/결제 대상 시 법인 또는 파트너)
- [ ] **이용약관** 법무 검토 및 공개 URL
- [ ] **개인정보처리방침** 법무 검토 및 공개 URL
- [ ] **환불/취소/분쟁 처리 정책** (NEW EXIT 보호/에스크로와 일치)
- [ ] **통신판매업 신고** (해당 시)
- [ ] **개인정보 처리 위탁 계약** (SMS, PG, 클라우드, 배송 파트너)
- [ ] **CS 채널** (이메일/전화/앱 내 문의) — 약관에 명시된 `support@newexit.co.kr`

### 2.2 인프라 (서버/DB/보안)

| 항목 | 추천 | 용도 |
|------|------|------|
| API 서버 | AWS / GCP / Railway / Render | 24시간 API 운영 |
| DB | MongoDB Atlas | 사용자/상품/주문/결제 |
| 파일 저장 | AWS S3 / Cloudinary | 상품 이미지 |
| 도메인 + SSL | `api.newexit.co.kr` | HTTPS API |
| CDN | CloudFront / Cloudflare | 이미지/정적 파일 |
| 로그/에러 | Sentry | 장애 추적 |
| 백업 | Atlas 자동 백업 + 스냅샷 | 데이터 복구 |

**보안 최소 요건**

- [ ] HTTPS 강제
- [ ] JWT + Refresh Token
- [ ] Rate limiting / WAF
- [ ] 비밀번호 bcrypt (현재 적용됨)
- [ ] 결제 webhook 서명 검증
- [ ] 카드번호 등 민감정보 **서버 저장 금지** (PG 위임)
- [ ] 관리자 페이지 접근 제어 (RBAC)

### 2.3 인증 (로그인)

| 방식 | 필요 작업 | 비고 |
|------|-----------|------|
| 이메일/비밀번호 | ✅ API 있음 | 비밀번호 재설정 추가 |
| 전화 OTP | SMS 업체 계약 | Twilio, 국내/몽골 SMS |
| Kakao | Kakao Developers 앱 등록 | 한국 사용자 |
| Google | Google Cloud OAuth | |
| Apple | Apple Sign In 설정 | **iOS 앱스토어 심사 시 권장/필수 조건** |

### 2.4 결제 (실제 PG)

앱 UI 기준 결제 수단:

| 수단 | 필요한 것 |
|------|-----------|
| 카드 | PG사 계약 (토스페이먼츠, 나이스, 이니시스 등) |
| Z-Pay | Z-Pay 제휴 계약 + API |
| 계좌이체 | 가상계좌/입금확인 API |
| 포인트 | 자체 포인트 ledger DB |

**결제 구현 필수 항목**

- [ ] 결제 요청 API
- [ ] 결제 성공/실패 webhook
- [ ] 주문 상태 연동 (`pending` → `paid` → `confirmed`)
- [ ] 환불 API
- [ ] 정산(판매자/배송기사 수익) 로직
- [ ] 영수증/거래내역 조회
- [ ] 에스크로(NEW EXIT 보호): 결제 보류 → 거래 완료 후 정산

**Apple 심사 참고**

- 실물 상품 중고거래/배송: 외부 PG 사용 가능
- 디지털 콘텐츠/구독: Apple In-App Purchase 필요 (현재 모델은 해당 없음)

### 2.5 핵심 비즈니스 기능

| 기능 | 실서비스 요구 |
|------|---------------|
| 상품 등록 | 실제 이미지 업로드(S3), 검수/신고 |
| 중고거래 | 채팅, 주문, 분쟁 처리 |
| 배송 | 택배 API 연동, 기사 앱 GPS(선택) |
| 한국→몽골 | 운임 계산, 통관 파트너, 트래킹 |
| 메시지 | WebSocket 또는 Firebase 실시간 |
| 관리자 | 상품/주문/사용자/정산/분쟁 관리 콘솔 |
| 알림 | 푸시(FCM + APNs), 주문/배송 상태 |

---

## 3. App Store 출시 체크리스트 (iOS)

### 3.1 필수 계정/비용

| 항목 | 비용 |
|------|------|
| Apple Developer Program | **$99/년** |
| EAS Build (Expo) | 무료 티어 가능, 유료 플랜 선택 가능 |

### 3.2 빌드·배포 절차

1. [ ] Apple Developer 가입
2. [ ] App Store Connect 앱 등록
3. [ ] Bundle ID: `kr.co.newexit.app` (현재 설정)
4. [ ] EAS Build로 iOS `.ipa` 생성
5. [ ] TestFlight 내부 테스트
6. [ ] App Store 심사 제출

### 3.3 심사 제출 시 필요 자료

- [ ] 앱 스크린샷 (iPhone 필수 사이즈)
- [ ] 앱 설명 (몽골어/한국어/영어)
- [ ] 개인정보 수집 항목 선언 (App Privacy)
- [ ] 이용약관/개인정보 URL
- [ ] **테스트 계정** (심사관용 로그인 정보)
- [ ] 결제/주문이 실제 동작하는 환경
- [ ] 위치/카메라/알림 권한 사용 이유 문구

### 3.4 Windows에서 가능한 것

| 작업 | Windows |
|------|---------|
| 앱 개발 | ✅ Expo |
| iOS 클라우드 빌드 | ✅ EAS Build |
| TestFlight 업로드 | ✅ |
| Xcode 로컬 빌드 | ❌ Mac 필요 |

---

## 4. Android (선택)

| 항목 | 비용 |
|------|------|
| Google Play Console | **$25 (1회)** |

- APK/AAB 빌드: EAS Build
- Play Store 심사 및 정책: iOS와 유사

---

## 5. 예상 비용 (초기)

| 항목 | 대략 |
|------|------|
| Apple Developer | $99/년 |
| Google Play (선택) | $25 1회 |
| 클라우드 서버 + DB | 월 $50~300 (트래픽에 따라) |
| 이미지 스토리지 | 월 $10~50 |
| SMS OTP | 건당 과금 |
| PG 수수료 | 거래당 약 2~3%+ |
| 도메인 | 연 $10~20 |
| 법무/회계 | 별도 |

---

## 6. 추천 단계별 로드맵

### Phase 1 — 출시 가능 MVP (목표: 2~3개월)

**목표**: TestFlight에서 실제 결제까지 동작하는 베타

- [ ] MongoDB Atlas + API 클라우드 배포
- [ ] HTTPS API (`api.newexit.co.kr`)
- [ ] 이미지 업로드 (S3/Cloudinary)
- [ ] 이메일/전화 OTP 로그인
- [ ] PG 1종 연동 (카드만)
- [ ] 주문/결제 webhook
- [ ] 배송 상태 API
- [ ] 이용약관/개인정보 페이지
- [ ] TestFlight 베타 배포
- [ ] `EXPO_PUBLIC_OFFLINE_DEMO=0` 전환

### Phase 2 — 서비스 강화 (3~6개월)

- [ ] Kakao / Google / Apple 로그인
- [ ] Z-Pay, 포인트, 환불
- [ ] 실시간 채팅
- [ ] 관리자 콘솔
- [ ] 한국→몽골 배송 견적/통관
- [ ] 푸시 알림

### Phase 3 — 정식 출시

- [ ] App Store 심사 통과
- [ ] 고객센터/분쟁 처리 프로세스
- [ ] 정산 자동화
- [ ] 모니터링/보안 점검
- [ ] (선택) Google Play 출시

---

## 7. 기술 전환 작업 (개발 관점)

### 7.1 환경변수 (프로덕션)

```env
# mobile/.env (프로덕션 빌드 시)
EXPO_PUBLIC_API_URL=https://api.newexit.co.kr/api
EXPO_PUBLIC_OFFLINE_DEMO=0

# backend/.env (프로덕션)
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<강력한 랜덤값>
NODE_ENV=production
```

### 7.2 API 엔드포인트 (현재 → 확장)

| 현재 | 프로덕션 추가 |
|------|---------------|
| POST /auth/login/email | POST /auth/otp/send, /auth/otp/verify |
| POST /auth/register | POST /auth/password/reset |
| GET/POST /products | POST /upload (이미지) |
| POST /orders | POST /payments/webhook |
| GET /deliveries/* | PATCH /deliveries/:id/status |

### 7.3 DB 컬렉션 (현재)

- `users` — 사용자, 역할, 포인트
- `categories` — 상품 카테고리
- `products` — 상품 목록
- `orders` — 주문
- `deliveries` — 배송 추적

**추가 예정**

- `payments` — 결제 트랜잭션
- `messages` — 채팅
- `notifications` — 알림
- `settlements` — 정산

---

## 8. 합법 운영 체크리스트 (요약)

실서비스 오픈 전 최소 확인:

1. [ ] 사업자/법인 등록
2. [ ] 이용약관·개인정보처리방침 게시
3. [ ] PG 계약 및 세금계산서/정산 체계
4. [ ] 개인정보 수집·이용 동의
5. [ ] 환불/분쟁 처리 프로세스
6. [ ] CS 연락처 운영
7. [ ] 서버/DB 보안 (HTTPS, 백업)
8. [ ] Apple Developer + TestFlight/App Store

---

## 9. 바로 다음에 할 일 (우선순위)

1. **Apple Developer 가입** ($99) — iOS 출시 필수
2. **MongoDB Atlas** 무료 티어로 DB 클라우드 이전
3. **API 서버 배포** (Railway/Render 등)
4. **PG사 상담** (토스페이먼츠 등) — 카드 결제 1종
5. **이용약관/개인정보** 초안 법무 검토
6. **TestFlight 베타** — 오프라인 데모 끄고 실제 API 연동

---

## 10. 참고 링크

- [Expo EAS Build](https://docs.expo.dev/build/introduction/)
- [Apple Developer Program](https://developer.apple.com/programs/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [MongoDB Atlas](https://www.mongodb.com/atlas)
- [토스페이먼츠](https://www.tosspayments.com/)
- [Expo SDK 54 호환성](https://docs.expo.dev/versions/v54.0.0/)

---

*문서 작성일: 2026-06-05*  
*프로젝트: NEW EXIT — 몽골·한국 중고거래 + 물류 슈퍼앱*
