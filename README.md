# FORM — Native Fitness Journal

미니멀한 iOS·Android 운동 기록 앱. React Native의 네이티브 뷰, Swift HealthKit 모듈, Kotlin Health Connect 모듈, SwiftUI Apple Watch 앱, Compose Wear OS 앱을 포함합니다. WebView나 PWA를 앱으로 포장하지 않습니다.

> **현재 단계: 네이티브 빌드 및 시뮬레이터 검증 중.** Android·iOS·Wear OS·watchOS 컴파일에 성공했고, iOS 홈 첫 실행·재실행 화면을 확인했습니다. Android Release 구동 검증은 진행 중입니다. 건강 권한·워치 페어링·실기기 설치·스토어 배포는 미검증입니다. 최신 결과는 [검증 기록](docs/VALIDATION.md)을 확인하세요.

## 이번 통합 변경

- Planfit 공개 화면을 참고한 한 운동 집중 기록 화면을 실제 앱에 연결했습니다.
- 무채색 테마와 시스템 글꼴, 내용 영역의 불투명 패널, 조작·탐색 영역의 선택형 유리 효과를 적용했습니다.
- 세트 입력과 완료를 함께 저장하며 워치 독립 운동 백업 복원을 수정했습니다.
- 99% 기능·화면 동등성은 검증되지 않았습니다. 현재 63종 운동 안내와 수동 인바디 입력을 제공합니다.

## 디자인 검토

- 라이트 / 다크 / 시스템 설정 추종.
- **Liquid Glass ON/OFF 독립 설정**. 기본 OFF.
- OFF: 단색 패널. ON: 지원 iOS에서 네이티브 GlassView, 다른 환경에서 반투명 패널.
- 투명도 줄이기, 44~48pt 이상 주요 터치 영역, 명시적인 저장 오류, 빈 상태.
- 최신 요청: **무채색 중심 + 선명한 유리 효과 + 읽기 쉬운 타이포그래피**. 디자인 최종 승인 대기.
- `design/preview.html`: 홈·운동·인바디 비교용 인터랙티브 시안. 네이티브 앱 실행 화면이 아니며 샘플 수치를 사용합니다.
- `design/review-01.png`: 첫 번째 시안. 최신 수정 요청 전 버전으로 이력을 보존합니다.

## 구현한 소스 범위

| 영역 | 포함 내용 | 한계 / 후속 작업 |
|---|---|---|
| 운동 기록 | 세트, 중량, 횟수, 시간, 거리, 일반·워밍업·드롭, 메모, 이전 기록 채움 | 고급 슈퍼세트·RPE 전용 입력 개선 필요 |
| 휴식 | 종료 시각 기준 타이머, 로컬 알림, 취소 | OS 강제 종료·절전 모드 실기기 확인 필요 |
| 루틴 | 생성·편집·운동 선택, 기본 전신·상체·하체·맨몸 루틴 | 주간 캘린더 예약 미구현 |
| 성장 | 히스토리, 주간 볼륨, 추정 1RM | 심화 근육별 분석·소셜 미구현 |
| 운동법 | 한국어 63종, 부위·장비 검색, 3단계 설명, 주의사항 | 모든 운동을 망라하지 않음. 동작 영상·3D·트레이너 감수는 후속 |
| 인바디 | 측정일, 체중, 체지방률, 골격근량, 키, 허리둘레, 내장지방 레벨, BMR, 메모, 사진 | 수동 입력. 제조사 API / OCR 미구현 |
| Apple 건강 | 걸음·심박·체중·체지방·최근 운동 읽기, 체중·체지방·운동 쓰기 | 실기기 검증 전. 피트니스 링 반영은 Apple 정책에 따름 |
| Android 건강 | Health Connect 읽기·쓰기, 권한 안내 Activity | Samsung Health에서 공유 설정한 호환 데이터만 사용 |
| Apple Watch | 세트 완료 리모컨, 독립 운동, 심박·에너지, HealthKit 저장 | 앱 타깃 embed·서명·실기기 검증 필요 |
| Galaxy Watch | Wear OS 세트 리모컨, 독립 타이머·심박, 휴대폰 전송 | Watch4 이후 Wear OS 대상. Tizen 미지원. 심박 시계열 저장 미구현 |
| 데이터 | SQLCipher DB, 기기 보안 저장소 키, 백업 병합/내보내기 | 로그인·서버·기기 간 클라우드 동기화 미구현 |

## 구조

```text
src/                     네이티브 화면, 테마, 도메인 로직, 암호화 DB
modules/form-device/     Swift / Kotlin 네이티브 연동 모듈
watchos/                 SwiftUI Apple Watch 앱과 XcodeGen 설정
wearos/                  Kotlin Compose Wear OS 독립 빌드 프로젝트
plugins/                 Expo prebuild 구성
tests/                   데이터 검증·중복 이벤트·계산 테스트
design/                  승인용 UI 시안 (프로덕션 앱과 별도)
docs/                    아키텍처, 설정, 검증, 출시 과제
.github/workflows/       소스 검사 및 수동 네이티브 빌드
```

## 휴대폰 앱 실행

Node.js 22 LTS 이상, npm, JDK 17, Android Studio/SDK 36이 필요합니다. iOS는 macOS와 Xcode가 필요합니다. **Expo Go로는 커스텀 네이티브 모듈·SQLCipher를 실행할 수 없습니다.**

```sh
git clone https://github.com/M0lli2/form-fitness.git
cd form-fitness
npm install
npx expo install --check
npm test
npm run check
npm run typecheck
npx expo prebuild
npm run android
# macOS:
npm run ios
```

SDK 54를 기준으로 의존성을 선언했습니다. npm 설치가 완료되면 생성된 `package-lock.json`을 커밋해 고정해야 합니다. `expo install --check`에 불일치가 나오면 해당 SDK가 권장하는 버전으로 맞춘 뒤 테스트하세요. 네이티브 모듈 수정 후에는 앱을 다시 빌드해야 합니다.

### 개발 빌드 / 배포 빌드

```sh
npx eas-cli build --profile development --platform android
npx eas-cli build --profile preview --platform android
npx eas-cli build --profile production --platform ios
```

EAS 계정·프로젝트 연결·개발자 서명은 저장소에 포함하지 않습니다. 사용자 계정에서 설정해야 합니다. 스토어 제출은 자동 실행하지 않습니다.

## Apple Watch

1. macOS에서 `brew install xcodegen`.
2. `cd watchos && xcodegen generate`.
3. `FORMWatch.xcodeproj`를 Xcode로 열고 개발자 Team을 선택합니다.
4. 휴대폰 앱과 워치 앱에 HealthKit capability를 활성화합니다.
5. 휴대폰: `com.mori.form`, 워치: `com.mori.form.watchkitapp`, companion: `com.mori.form`을 일치시킵니다.
6. 배포용 휴대폰 프로젝트에는 watch 앱을 추가하고 Embed Watch Content를 구성합니다. 현재 prebuild는 이 embed를 자동 생성하지 않습니다.
7. 페어링된 실제 iPhone/Apple Watch에 설치해 권한·심박·전송을 검증합니다.

Apple Watch가 HealthKit에 저장한 운동은 휴대폰에서 다시 내보내지 않습니다. 운동 중 프로세스 종료 복구와 저장 실패 재시도는 출시 전 보강 항목입니다.

## Galaxy Watch / Wear OS

JDK 17, Gradle 8.11.1, Android SDK 36이 필요합니다. Android Studio에서 `wearos/`를 열거나 다음을 실행합니다.

```sh
gradle -p wearos wrapper --gradle-version 8.11.1
cd wearos
./gradlew assembleDebug
```

휴대폰과 워치의 applicationId 및 서명 인증서가 같아야 Data Layer 통신이 가능합니다. 서로 다른 머신의 기본 debug 키를 섞지 마세요. Play 배포 시 같은 앱의 Wear OS 트랙을 사용합니다. Galaxy Watch4 이상 Wear OS 기기를 대상으로 하며 구형 Tizen Galaxy Watch는 별도 앱이 필요합니다.

## 건강 연동과 데이터 의미

- iOS: HealthKit → Apple 건강. 건강에 저장된 운동이 피트니스에 어떻게 표시되는지는 Apple이 결정합니다. 모든 피트니스 점수·링을 직접 수정할 수 없습니다.
- Android: Health Connect ↔ 호환 앱. Samsung Health의 Health Connect 공유 설정이 필요합니다. Samsung 계정·모든 Samsung 독점 지표를 직접 읽는 구현은 아닙니다.
- **골격근량 ≠ 제지방량.** 골격근량을 HealthKit lean body mass로 잘못 저장하지 않습니다.
- 체지방률: 앱과 Health Connect에서는 0~100, HealthKit에서는 0~1로 변환합니다.
- 건강 권한은 사용자가 연결 버튼을 누를 때 요청합니다. 읽기 허용 여부를 iOS에서 확정적으로 알 수 없으므로 성공을 과장하지 않습니다.
- 읽은 값이 없는 경우 0이나 가짜 데이터를 채우지 않습니다.
- 샘플 쓰기에 안정적인 ID를 사용해 재전송 중복을 억제합니다. 편집한 데이터의 버전 정책은 출시 전 추가 검증합니다.

## 데이터 보관

- 운동·체성분은 SQLCipher DB에 저장, 키는 SecureStore에 보관합니다.
- 인바디 사진은 앱 전용 폴더에 저장됩니다. 별도 사진 암호화는 아직 없습니다.
- 백업 JSON은 **평문**이며 사진을 포함하지 않습니다. 공유 전 안내가 표시됩니다.
- 앱 기록 삭제와 HealthKit / Health Connect에 이미 내보낸 기록 삭제는 별개입니다.
- 분석·광고·원격 서버 전송 코드는 없습니다.
- `docs/PRIVACY.md`는 구현 설명 초안이며 실제 스토어 제출 시 사업자 정보와 공개 정책 URL을 보완해야 합니다.

## 코드 주석 기준

각 코드 파일에 역할을 설명하고 저장 순서, 권한 처리, 단위 변환, 중복 제거, 플랫폼 차이 등 오해하기 쉬운 로직에 주석을 작성했습니다. JSON은 주석을 지원하지 않으므로 이 README와 문서에 구성 의미를 설명합니다.

## 검증

```sh
npm test                   # 의존성 없이 도메인 테스트
npm run check              # JSON·브리지 계약·앱 ID 검사
npm run typecheck          # npm install 필요
```

GitHub Actions의 `Source checks`는 push 시 실행합니다. `Native build validation`은 Actions에서 수동 실행합니다. **실행 설정이 존재한다는 사실은 빌드 성공을 의미하지 않습니다.**

## 다음 출시 게이트

1. 의존성 설치·타입 검사·Android/iOS/Wear/watchOS 컴파일 통과.
2. 무채색·선명한 Glass·폰트 수정 시안 승인 및 네이티브 화면 일치.
3. 실제 4종 기기에서 권한 거부/부분 허용/취소/오프라인/재연결/강제종료 검사.
4. 건강 데이터 원본 구분, 수정·삭제 동기화, 보안·접근성 검토.
5. 운동 콘텐츠 전문가 감수, 자체 동작 이미지/영상 확보.
6. App Store / Play Console 건강 권한·개인정보·심사 정보 작성 및 서명 배포.

상위 앱의 모든 기능과 모든 운동을 완료했다고 주장하지 않습니다. 목표와 실제 구현·검증 상태를 구분하여 유지합니다.
