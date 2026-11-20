# 검증 상태

이 문서는 실제 결과와 아직 실행하지 않은 항목을 구분합니다.

## v0.3.0

| 범위 | 결과 |
|---|---|
| 소스 검사 | 도메인 테스트 82개, iOS·Android 네이티브 계약, 타입 검사와 Android JS 번들 생성 통과. [소스 검사](https://github.com/M0lli2/form-fitness/actions/runs/44655494711) |
| Android 휴대폰 | 에뮬레이터에서 운동 준비·시작·일시정지·계속·종료, 저장과 재실행, 볼륨 전환과 설정 버튼 정렬을 확인. [릴리스 검증](https://github.com/M0lli2/form-fitness/actions/runs/44655494908) |
| Wear OS | 버전 0.3.0과 빌드 3, 휴대폰 APK 및 v0.2.0 테스트 배포와 같은 APK 서명 인증서를 확인. [릴리스 검증](https://github.com/M0lli2/form-fitness/actions/runs/44655494908) |
| iPhone·iPad와 Apple Watch | iPhone 시뮬레이터 XCTest를 실행하고 iPhone·iPad용 IPA와 Apple Watch 앱 포함 IPA의 버전을 확인. IPA는 미서명. [릴리스 검증](https://github.com/M0lli2/form-fitness/actions/runs/44655494908) |

## 이전 검증 기록 · 2026-11-18

| 범위 | 결과 및 근거 |
|---|---|
| 도메인·UI 정책 테스트 | 로컬 20개 통과. 서울/로스앤젤레스/UTC 인바디 편집 날짜 회귀 테스트 포함 |
| 로컬 구문·구성 검사 | 26개 소스 구문 오류 0, JSON·브리지·앱 식별자 검사 통과 |
| 의존성 기반 소스 검사 | [6175198 Source checks](https://github.com/M0lli2/form-fitness/actions/runs/44076888020): npm 설치, 테스트, 타입 검사, Android JS 번들 성공 |
| 4개 플랫폼 컴파일 | [9cddd1f Native build](https://github.com/M0lli2/form-fitness/actions/runs/44028230680): Android, Wear OS, iOS·watchOS 성공 |
| iOS 홈 구동 | [8d2d1a6 runtime](https://github.com/M0lli2/form-fitness/actions/runs/44027138434): ad-hoc 서명한 시뮬레이터 앱 설치·첫 실행·강제 종료 후 재실행·홈 OCR 성공. 스크린샷 직접 확인 |
| Android Release 구동 | [6175198 runtime](https://github.com/M0lli2/form-fitness/actions/runs/44076887909): 홈·루틴·기록·설정 문구 및 종료 후 홈 재실행 성공. 홈 스크린샷 직접 확인 |

최신 커밋의 검증 결과는 해당 커밋의 Actions에서 확인합니다. 이전 빌드 성공은 이후 변경 전체의 검증을 의미하지 않습니다. 1d7eec8 날짜 수정은 기능 테스트를 통과했지만 타입 선언 검사에 실패해 후속 커밋에서 JSDoc 매개변수 타입을 보완했습니다.

## 확인한 실패와 수정

- iOS 최초 runtime의 프로세스 실행 성공은 오판이었다. 화면에서 SecureStore entitlement 오류를 발견했고 ad-hoc 서명과 OCR 검사를 추가한 후 정상 홈을 확인했다.
- Android Health Connect 생성자의 잘못된 오버로드 선택은 이름 있는 인자와 exerciseRoute 지정으로 수정했고 네이티브 빌드가 통과했다.
- Android 에뮬레이터 준비 중 디스크 부족은 빌드/실행 머신 분리로 해결했다.
- Android 44028230692는 설치 후 첫 UIAutomator XML 수집에서 중단됐다. 앱 UI 정상 여부는 미확인이다. 현재 스크립트는 픽셀을 먼저 저장하고, 임시 XML 실패를 제한 시간 내 재시도하며, 앱 패키지의 실제 화면 문구를 검사한다.
- Android 구동 검증을 개발용 런처가 없는 Release APK로 변경했다. CI 테스트 서명은 스토어 배포 서명이 아니다.
- 인바디 편집 폼의 UTC 날짜 잘라내기를 현지 날짜 포맷으로 변경했다.

## 실행 검증 범위

기본 Android smoke는 홈·루틴·기록·설정과 프로세스 재실행을 검사한다. 별도 saved-data journeys는 실제 테마/Glass 설정 저장, 재시작 후 유지, 운동법 열기, 세트 완료, 운동 저장, 재시작 후 히스토리 유지까지 검사하도록 작성했다. **테스트 작성은 통과를 의미하지 않는다.** 빌드 커밋과 테스트 커밋을 evidence/provenance에 별도로 남긴다.

## 출시 전 미검증

- iPhone + Apple Watch / Android + Galaxy Watch 실기기 설치·동일 서명·페어링
- Health 권한 허용·거부·부분 허용·철회, 실제 읽기/쓰기와 중복·수정·삭제 정책
- 워치 오프라인 전달, 독립 운동 중 프로세스 종료, 백그라운드 심박
- 긴 운동 세션, 알림·절전, 사진 보존, 백업 병합 전체 사용자 흐름
- 큰 글씨·스크린리더·키보드·회전·실제 OS 유리 효과·성능
- 최신 네이티브 화면 디자인 승인, 운동 콘텐츠 감수
- 배포 서명·스토어 등록·심사

현재 최종 출시 완성본으로 분류하지 않습니다.

## 11월 18일 후속 개발

- 44066af에서 날짜 입력 JSDoc 타입을 수정했다.
- 8deb2e6에서 운동이 없을 때 전체 화면을 매초 다시 그리는 타이머를 중단했다. 활성 운동은 종료 시각 기반 타이머를 유지한다.
- 별도 saved-data journeys [44079623831](https://github.com/M0lli2/form-fitness/actions/runs/44079623831)는 기본 smoke의 종료/재실행 단계에서 UIAutomator could not get idle state로 실패했다. 저장 설정·실제 운동 저장 흐름에 도달하지 않았으므로 해당 항목은 통과하지 않았다. 실패 시 스크린샷은 정상 홈이었다.
- 화면 전환 직전의 픽셀이 저장되는 경우를 발견해, 문구 검증 직후 스크린샷을 다시 찍도록 수정했다.
- 8deb2e6의 Android Release 재빌드는 진행 중이다. 최신 수정본의 구동 결과는 아직 확정하지 않는다.

## 추가 구현 및 검증 (2026-11-18)

- 사용자 운동 등록: 이름·부위·장비·기록 방식·방법·주의사항을 입력하고 루틴/운동/백업에서 사용한다.
- 집중 기록 화면에 lb 설정을 반영한다. 저장 값은 kg로 유지하며 입력만 변환한다.
- 인바디 편집 저장 시 revision을 올려 HealthKit SyncVersion / Health Connect clientRecordVersion에 전달한다. 같은 저장본의 재시도는 버전을 유지한다.
- 위 변경의 로컬 테스트 26개 통과. e210fcc Source checks에서 타입 검사·Android JS 번들까지 통과했다.
- 8deb2e6 및 ea2de14 Android Release 기본 구동 검증 통과.
- [1462eee native build 44206323528](https://github.com/M0lli2/form-fitness/actions/runs/44206323528): Android/Wear OS/Apple 모두 성공. Apple job은 iPhone 프로젝트에 워치 타깃 추가 및 iPhone 앱 내부 Watch/FORMWatch.app 존재까지 검사했다.
- [0672495 Apple job](https://github.com/M0lli2/form-fitness/actions/runs/44206498369)은 워치 포함 빌드 성공. 휴대폰/Wear OS 동일 인증서 검사 결과는 별도 확인이 필요하다.
- saved-data journeys는 에뮬레이터 데이터 파티션 공간 부족으로 부팅 전 실패했다. 디스크 2048M과 부팅 제한 시간을 지정했다. 새 관찰 도구의 중복 onCreate 선언도 제거했다. 이 전체 흐름은 통과 결과를 아직 기록하지 않는다.
- package-lock.json을 실제 CI 설치 결과로 고정했고 Source checks는 npm ci를 사용한다.
- 의존성 감사는 40개 영향 패키지(높음 29·중간 11)를 보고했다. npm audit fix --package-lock-only 호환 업데이트 실험은 React Native Flow 번들 오류로 실패했다. 실패한 lock은 채택하지 않았다. picomatch 관련 GHSA-fc5q-39xc-vjpf는 확인 당시 수정 버전이 없어 출시 전 별도 대응이 필요하다.
- 최신 runtime 빌드는 Android 실기기용 arm64-v8a와 에뮬레이터용 x86_64를 함께 포함하도록 구성했다. CI 테스트 서명은 production 서명이 아니다.

### 자동화로 대체할 수 없는 현재 조건

실제 센서·권한·페어링 검증에는 사용 가능한 iPhone/Apple Watch 및 Android/Wear OS 기기 접근이 필요하다. 이 환경에는 adb/Xcode 로컬 도구나 연결된 기기가 없다. 시뮬레이터 통과를 실기기 통과로 바꾸지 않는다. App Store/Play 배포에는 사용자의 개발자 팀·서명·프로비저닝·스토어 프로젝트 접근이 필요하며 현재 제공된 연결은 GitHub다. 계정/클라우드·AI 추천·소셜·전문 운동 영상은 여전히 미구현이다.

## 화면 캡처 및 후속 검증 (2026-11-18)

- [Android Release](https://github.com/M0lli2/form-fitness/actions/runs/44245001027): 7b37312에서 ARM64·x86_64 빌드, 홈·4개 메뉴·재실행 통과.
- [Android 저장·복원](https://github.com/M0lli2/form-fitness/actions/runs/44246921105): 7b37312 APK와 edbeba0 테스트로 다크 모드·Glass 설정 복원, 푸시업 세트 완료, 운동 저장, 강제 종료 후 히스토리 복원을 모두 확인했다.
- [동일 서명 테스트 APK](https://github.com/M0lli2/form-fitness/actions/runs/44246921064): 위 Android 휴대폰 APK와 Wear OS APK의 SHA-256 서명이 일치했다. 실기기 페어링 검증은 남아 있다.
- [iOS 실행 검증](https://github.com/M0lli2/form-fitness/actions/runs/44245272504): iPhone 시뮬레이터 Release 빌드·설치·홈 실행·재실행까지 성공했다. 추가 XCTest는 테스트 번들의 제품명이 비어 빌드 단계에서 실패했다. 제품명을 지정하고 재검증한다.
- [소스 검사](https://github.com/M0lli2/form-fitness/actions/runs/44245516445): 테스트 28개·타입 검사·Android 번들이 통과했다. 검사한 JavaScript 소스 그래프에서 확인 대상 5개 빌드 도구 패키지는 발견되지 않았다.

## 설치 파일 후속 검증 (2026-11-18)

- [동일 서명 APK 묶음](https://github.com/M0lli2/form-fitness/actions/runs/44246921064/artifacts/14401473315)의 SHA-256과 이전에 검증한 두 APK의 해시를 확인했다.
- 두 APK의 바이너리 매니페스트를 열어 앱 ID `com.mori.form`, 홈 화면에서 실행할 수 있는 진입점, 휴대폰의 Health Connect 권한 8개 및 백업 비활성화, 워치의 Wear OS 기기 선언을 확인했다. 권한 요청 UI와 센서 동작은 실제 기기에서 검증해야 한다.
- 로컬 테스트 28개 및 프로젝트 설정 검사 통과. 오프라인 의존성 설치는 npm 캐시에 필요한 패키지가 없어 전체 타입 검사를 재실행하지 못했다.
- [수정 후 iOS 검증](https://github.com/M0lli2/form-fitness/actions/runs/44286882058)은 러너 배정 없이 종료됐다. iOS의 기존 홈 실행과 재실행 성공 기록은 유효하며, 추가 UI 테스트는 아직 실행되지 않았다.
- 설치 파일 검증 당시에는 기본 63종의 텍스트 가이드와 주의사항을 제공했다. 이후 소스 변경은 아래에 기록한다.

## 운동도감·3D·UI 업데이트 (2026-11-18)

- 소스 커밋 `5880e30`에는 운동도감, 3D 자세 8종, 운동 추가 전 자세 미리보기와 홈·탭 UI 개선이 포함됩니다. 현재 다운로드 가능한 APK는 이 변경 이전에 검증한 테스트 빌드입니다. [최신 Android 빌드 상태](https://github.com/M0lli2/form-fitness/actions/runs/44292623016)
- 도메인 테스트 30개와 로컬 구문·구성 검사가 통과했다.
- [Android 빌드](https://github.com/M0lli2/form-fitness/actions/runs/44292623016)와 [소스 CI](https://github.com/M0lli2/form-fitness/actions/runs/44292625060)는 작업 실행 전에 종료됐다. 이번 변경을 포함한 새 APK와 네이티브 캡처는 생성되지 않았다.
- Android와 iOS 자동 실행 테스트에 운동 선택, 3D 재생·정지·회전 및 확대 확인을 포함했다. 두 플랫폼의 최신 실행 결과는 러너에서 테스트가 진행된 후 기록한다.
