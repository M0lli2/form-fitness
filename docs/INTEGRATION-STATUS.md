# 통합 검증 — 2026-11-17

전체 휴대폰·워치 소스를 UI v2와 합쳤다. src/App.tsx가 FormTheme, FocusedWorkout, Surface를 사용한다. 집중 화면은 근력 운동 kg 입력 전용이다. 내용 카드는 불투명하고 탐색·조작층만 유리 효과를 쓴다.

도메인·UI 정책 회귀 테스트 16개, JSON·브리지·동반 앱 식별자 검사, TypeScript 구문 검사 통과. GitHub Actions 8a1e8c6 커밋에서 날짜 입력·4개 메뉴 변경을 포함한 전체 타입 검사와 Android JS 번들 생성도 성공했다.

## 네이티브 빌드 근거
- iOS 시뮬레이터 및 watchOS 시뮬레이터: [Apple job 성공](https://github.com/M0lli2/form-fitness/actions/runs/43991863970/job/133734220422). 서명 없는 컴파일이며 실기기 설치·배포 성공과 다르다. 커밋 32e624b 기준이다.
- Wear OS: [디버그 APK 빌드·업로드 성공](https://github.com/M0lli2/form-fitness/actions/runs/43992045497). 아티팩트 form-wearos-debug, 커밋 e19eea6.
- Android 휴대폰: 첫 빌드의 모듈 versionName 누락을 1c39e6e에서 수정. [수정본 빌드](https://github.com/M0lli2/form-fitness/actions/runs/43992988842) 결과 확인 필요.

로컬 npm install은 DNS ENOTFOUND로 실패했으나 GitHub 서버에서는 설치에 성공했다. 플랫폼별 CI 빌드는 진행 중이며 APK/IPA 배포와 페어링된 실기기 검증은 완료하지 못했다. 의존성 감사에서 17건(중간 15, 높음 2)이 보고되어 출시 전에 원인·업데이트 범위 확인이 필요하다.

남은 출시 작업: 의존성 설치·잠금 파일, 전체 타입 검사와 네이티브 컴파일, 실제 화면 디자인 승인, 워치 전달·Health 권한·백그라운드 복구 검증, 운동법 콘텐츠 감수, 개발자 서명과 스토어 등록. AI 추천·소셜·클라우드 계정·운동 영상·모든 운동 커버리지는 미구현이다.

## 구동 테스트 재검토

2026-11-17 iOS runtime run 43994641754는 설치·프로세스 재실행에 성공했지만, 스크린샷 직접 확인 결과 SecureStore entitlement 오류 화면이었다. 따라서 홈 구동 통과가 아니며 해당 run의 success만으로 품질을 판단하면 안 된다. 테스트를 ad-hoc 시뮬레이터 서명과 홈 문구 OCR 검증으로 강화했다. 새 실행 44027138434의 결과와 스크린샷을 확인해야 한다.

Android 구동 테스트 43994266964는 Health Connect ExerciseSessionRecord의 internal 생성자 선택으로 컴파일 실패했다. exerciseRoute=null 및 이름 있는 인자를 지정해 public 생성자를 선택하도록 수정했다. 수정본의 실행 44026988239 결과 확인 필요.

실기기 HealthKit/Health Connect 권한, Apple/Galaxy Watch 페어링, 장시간 백그라운드 동기화, 접근성·화면 품질은 아직 검증 미완료다. 현재 앱을 최종 완성본으로 분류하지 않는다.
