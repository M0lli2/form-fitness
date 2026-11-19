# FORM 설치 및 배포 준비

## Android · Galaxy Watch 테스트 설치

[2026-11-19 프리뷰 다운로드](https://github.com/M0lli2/form-fitness/releases/tag/preview-2026-11-19)에서 휴대폰과 워치 파일을 받을 수 있습니다. 비공개 저장소에 접근할 수 있는 GitHub 계정으로 로그인하세요.

| 대상 | 파일 | 검증 범위 |
|---|---|---|
| Android 휴대폰 | `FORM-Android-preview.apk` | 최신 UI·3D 가이드 번들 내장. API 28 이상, ARM64·x86_64. 서명과 패키지 검사 통과 |
| Galaxy Watch4 이후 Wear OS | `FORM-Wear-OS.apk` | 기존 동반 앱. 휴대폰 APK와 서명 인증서 일치 |

휴대폰에서 APK를 열어 설치하거나 Android Platform Tools를 사용합니다. 개발자 옵션에서 휴대폰 USB 디버깅과 워치 무선 디버깅을 설정하고 각 식별자를 확인하세요.

```sh
adb devices
adb -s PHONE_SERIAL install -r FORM-Android-preview.apk
adb -s WATCH_SERIAL install -r FORM-Wear-OS.apk
```

Android 휴대폰 APK는 검증된 베이스에 새 Hermes 번들을 넣어 동일한 테스트 인증서로 다시 서명한 프리뷰입니다. [정렬, 서명, 패키지 내용 및 해시 결과](evidence/2026-11-19-android-apk.txt)와 [로컬 소스 검증](evidence/2026-11-19-local-tests.txt)을 확인할 수 있습니다. 최신 APK의 기기 실행·건강 권한·페어링은 검증 대기입니다. 이전 실행 결과는 [Android 자동 검증 기록](https://github.com/M0lli2/form-fitness/actions/runs/44246921064)에 있습니다.

같은 앱 ID를 다른 인증서로 설치했다면 테스트 APK로 업데이트할 수 없습니다. 앱 기록을 보존하려면 삭제 전에 백업하세요. 앱의 JSON 백업에는 결과지 사진이 포함되지 않습니다.

## iPhone · Apple Watch 설치

**일반 테스터에게 배포할 때는 TestFlight를 권장합니다.** Mac과 Xcode에서 iPhone과 Apple Watch를 바로 설치하려면 등록 기기 방식도 사용할 수 있습니다. 두 방법 모두 FORM의 HealthKit 권한을 포함한 Apple 팀의 서명 구성이 필요합니다. 현재 저장소에는 사용자의 Apple 서명 정보나 설치 가능한 IPA가 없습니다.

### TestFlight

1. Apple Developer Program에 등록한 팀에서 휴대폰 `com.mori.form`과 워치 `com.mori.form.watchkitapp` 앱 ID를 확인하고 HealthKit을 활성화합니다. 이미 다른 팀이 ID를 소유한 경우 본인 팀의 고유 ID로 바꾸고 휴대폰·워치 동반 ID 및 테스트 식별자도 함께 맞춥니다.
2. Mac에서 저장소를 열고 아래 명령을 실행합니다. 준비 스크립트는 iPhone 프로젝트에 워치 타깃과 포함 단계를 생성합니다.

   ```sh
   npm ci
   npm run ios:prepare
   open ios/Form.xcworkspace
   ```

3. Xcode의 `FORM` 및 `FORMWatch` 타깃에서 같은 개발자 팀으로 자동 서명을 설정합니다. 두 타깃의 버전·빌드 번호를 맞추고, `FORM` 스킴과 일반 iOS 기기 대상을 선택해 **Product → Archive**를 실행합니다.
4. Organizer에서 워치가 포함된 아카이브를 확인하고 **Distribute App → App Store Connect**로 업로드합니다. App Store Connect의 **TestFlight → Internal Testing**에서 빌드를 선택하고 내부 테스터를 초대합니다. 외부 테스트 그룹은 Apple의 베타 심사 절차를 따릅니다.
5. 테스터가 iPhone에서 TestFlight 초대를 수락하고 FORM을 설치합니다. 페어링한 Apple Watch에 워치 앱이 제공되는지 확인하고 설치합니다. 휴대폰의 건강 권한과 워치 운동 전송을 각각 확인합니다.

### 등록된 기기에 직접 설치

Mac에 테스트할 iPhone을 연결하고, 페어링한 Apple Watch를 Xcode에서 선택할 수 있는 상태로 준비합니다. 위와 같이 프로젝트를 생성하고 서명한 뒤 **Product → Run**으로 설치합니다. 필요하면 iPhone·Watch에서 개발자 모드를 활성화합니다. 등록 기기용으로 배포할 경우 Xcode Organizer에서 등록 기기용 내보내기를 사용하고, 대상 기기를 프로비저닝에 포함합니다. 무료 Xcode Personal Team은 기간과 기능에 제한이 있어 FORM의 HealthKit 포함 배포 경로로 사용하지 않습니다.

[Apple TestFlight](https://developer.apple.com/testflight/) · [Apple 등록 기기 배포 안내](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices/) · [Apple 앱 배포 안내](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)

## 남은 실기기 검증

문서의 테스트에는 실제 건강 기록 대신 테스트용 운동·체성분만 사용합니다.

| 검증 항목 | 통과 기준 | 상태 |
|---|---|---|
| Android 기본 실행·로컬 기록 | 홈, 네 메뉴, 운동 저장, 강제 종료 뒤 히스토리와 다크·Glass 설정 복원 | 에뮬레이터 통과 |
| iOS 기본 실행 | 홈, 강제 종료 후 홈, 워치 앱 포함 빌드 | 시뮬레이터 검증 완료 |
| iOS 추가 UI | 루틴·기록·설정 이동, 재실행 후 다크 테마 유지 | XCTest 타깃 수정본 재검증 대기 |
| 건강 권한 | 거부 후 앱 사용 가능, 일부 허용 시 해당 값만 표시, 허용 철회 반영 | 두 플랫폼 실기기 대기 |
| 건강 기록 쓰기 | 테스트용 운동·체성분 내보내기, 동일 기록 재전송 시 중복 없음, 수정 체성분 반영 | 두 플랫폼 실기기 대기 |
| 워치 운동 전송 | 다음 세트 표시, 완료 전송, 연결 끊김 후 재연결해 한 번만 반영, 독립 운동 저장 | 두 플랫폼 실기기 대기 |
| 기기 설치·스토어 | 서명된 iOS 내부 배포 및 Google Play 내부 테스트에서 설치·실행 성공 | 개발자 계정·배포 서명 필요 |

Google Play 내부 테스트용 휴대폰 AAB는 Play 프로젝트와 업로드 서명이 연결된 환경에서 `npx eas-cli build --platform android --profile production`으로 생성합니다. Wear OS는 별도 AAB와 앱 서명의 일치 여부를 확인하고 해당 Wear OS 테스트 트랙에 등록합니다. 공개 배포 전 스토어의 건강 권한 선언, 개인정보처리방침 공개 URL, 스토어 등록 정보, 의존성 보안 점검을 완료합니다.

GitHub Actions의 최신 소스 검사 재실행은 계정 결제 또는 지출 한도 문제로 러너 시작 전에 종료됐습니다. 계정 소유자가 Billing & plans에서 상태를 확인한 뒤 [소스 검사](https://github.com/M0lli2/form-fitness/actions/runs/44286882078)와 [iOS 검증](https://github.com/M0lli2/form-fitness/actions/runs/44286882058)을 실행할 수 있습니다. 현재 [검증 근거](VALIDATION.md)에는 완료한 결과와 재검증 항목을 기록했습니다.
