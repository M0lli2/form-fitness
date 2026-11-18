# 검증 상태 — 2026-11-17

이 문서는 실제 결과와 아직 실행하지 않은 항목을 구분합니다.

## 확인한 결과

| 범위 | 결과 및 근거 |
|---|---|
| 도메인·UI 정책 테스트 | 로컬 20개 통과. 서울/로스앤젤레스/UTC 인바디 편집 날짜 회귀 테스트 포함 |
| 로컬 구문·구성 검사 | 26개 소스 구문 오류 0, JSON·브리지·앱 식별자 검사 통과 |
| 의존성 기반 소스 검사 | [6175198 Source checks](https://github.com/M0lli2/form-fitness/actions/runs/44076888020): npm 설치, 테스트, 타입 검사, Android JS 번들 성공 |
| 4개 플랫폼 컴파일 | [9cddd1f Native build](https://github.com/M0lli2/form-fitness/actions/runs/44028230680): Android, Wear OS, iOS·watchOS 성공 |
| iOS 홈 구동 | [8d2d1a6 runtime](https://github.com/M0lli2/form-fitness/actions/runs/44027138434): ad-hoc 서명한 시뮬레이터 앱 설치·첫 실행·강제 종료 후 재실행·홈 OCR 성공. 스크린샷 직접 확인 |
| Android Release 구동 | [6175198 runtime](https://github.com/M0lli2/form-fitness/actions/runs/44076887909): 진행 중. 결과 확인 전 통과로 취급하지 않음 |

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
