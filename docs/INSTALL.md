# Form 설치 및 배포 준비

[Form v0.3.2 릴리스](https://github.com/M0lli2/form-fitness/releases/tag/v0.3.2)에서 파일을 내려받으세요. 비공개 저장소에 접근 가능한 GitHub 계정이 필요합니다.

## Android · Galaxy Watch 테스트 설치

| 대상 | 파일 |
|---|---|
| Android 휴대폰 | `Form-0.3.2-Android.apk` |
| Wear OS · Galaxy Watch4 이후 | `Form-0.3.2-Wear-OS.apk` |

휴대폰에서 APK를 열어 설치하거나 Android Platform Tools를 사용합니다. 휴대폰 USB 디버깅과 워치 무선 디버깅을 설정한 뒤 기기 식별자를 확인하세요.

```sh
adb devices
adb -s PHONE_SERIAL install -r Form-0.3.2-Android.apk
adb -s WATCH_SERIAL install -r Form-0.3.2-Wear-OS.apk
```

두 APK는 같은 앱 ID와 v0.2.0부터 사용한 테스트 인증서를 사용합니다. 다른 서명으로 설치된 앱은 이 APK로 덮어쓸 수 없습니다. 삭제가 필요한 경우 기존 운동 기록을 먼저 백업하세요. JSON 백업에는 인바디 결과지 사진이 포함되지 않습니다.

## iPhone · Apple Watch 설치

**일반 테스터에게 배포할 때는 TestFlight를 권장합니다.** Mac과 Xcode에서 iPhone과 Apple Watch를 바로 설치하려면 등록 기기 방식도 사용할 수 있습니다. 두 방법 모두 Form의 HealthKit 권한을 포함한 Apple 팀의 서명 구성이 필요합니다. 릴리스에는 iPhone·iPad용 `Form-0.3.2-iOS-unsigned.ipa`와 Apple Watch 동반 앱을 포함한 `Form-0.3.2-iOS-unsigned-watch.ipa`가 있습니다. 두 파일은 미서명이며 바로 설치하거나 TestFlight에 업로드할 수 없습니다. 이 버전의 Liquid Glass 아이콘을 직접 빌드하려면 Xcode 26 이상이 필요합니다.

### TestFlight

1. Apple Developer Program에 등록한 팀에서 휴대폰 `com.mori.form`과 워치 `com.mori.form.watchkitapp` 앱 ID를 확인하고 HealthKit을 활성화합니다. 이미 다른 팀이 ID를 소유한 경우 본인 팀의 고유 ID로 바꾸고 휴대폰·워치 동반 ID 및 테스트 식별자도 함께 맞춥니다.
2. Mac에서 저장소를 열고 아래 명령을 실행합니다. 준비 스크립트는 iPhone 프로젝트에 워치 타깃과 포함 단계를 생성합니다.

   ```sh
   npm ci
   npm run ios:prepare
   open ios/Form.xcworkspace
   ```

3. Xcode의 `Form` 및 `FORMWatch` 타깃에서 같은 개발자 팀으로 자동 서명을 설정합니다. 두 타깃의 버전·빌드 번호를 맞추고, `Form` 스킴과 일반 iOS 기기 대상을 선택해 **Product → Archive**를 실행합니다.
4. Organizer에서 워치가 포함된 아카이브를 확인하고 **Distribute App → App Store Connect**로 업로드합니다. App Store Connect의 **TestFlight → Internal Testing**에서 빌드를 선택하고 내부 테스터를 초대합니다. 외부 테스트 그룹은 Apple의 베타 심사 절차를 따릅니다.
5. 테스터가 iPhone에서 TestFlight 초대를 수락하고 Form을 설치합니다. 페어링한 Apple Watch에 워치 앱이 제공되는지 확인하고 설치합니다. 휴대폰의 건강 권한과 워치 운동 전송을 각각 확인합니다.

### Windows에서 TestFlight 빌드 준비

EAS 클라우드 러너에서 iOS를 빌드하고 Windows에서 업로드할 수 있습니다. Apple Developer Program의 팀, App Store Connect 앱, Expo 프로젝트 연결과 배포 서명이 필요합니다. Apple Watch를 포함하는 경우 휴대폰과 워치 타깃 모두의 앱 ID·HealthKit 권한·프로비저닝을 준비하세요.

```sh
npx eas-cli login
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --latest
```

업로드한 빌드가 App Store Connect의 TestFlight에 나타나면 내부 테스트 그룹에 추가합니다. [Expo의 Windows 제출 안내](https://docs.expo.dev/submit/ios/) · [Apple TestFlight](https://developer.apple.com/testflight/)

### 등록된 기기에 직접 설치

Mac에 테스트할 iPhone을 연결하고, 페어링한 Apple Watch를 Xcode에서 선택할 수 있는 상태로 준비합니다. 위와 같이 프로젝트를 생성하고 서명한 뒤 **Product → Run**으로 설치합니다. 필요하면 iPhone·Watch에서 개발자 모드를 활성화합니다. 등록 기기용으로 배포할 경우 Xcode Organizer에서 등록 기기용 내보내기를 사용하고, 대상 기기를 프로비저닝에 포함합니다. 무료 Xcode Personal Team은 기간과 기능에 제한이 있어 FORM의 HealthKit 포함 배포 경로로 사용하지 않습니다.

[Apple TestFlight](https://developer.apple.com/testflight/) · [Apple 등록 기기 배포 안내](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices/) · [Apple 앱 배포 안내](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)

## 남은 실기기 검증

문서의 테스트에는 실제 건강 기록 대신 테스트용 운동·체성분만 사용합니다.

| 검증 항목 | 통과 기준 | 상태 |
|---|---|---|
| Android 기본 실행·로컬 기록 | 홈, 네 메뉴, 운동 저장, 강제 종료 뒤 히스토리와 다크·Glass 설정 복원 | 에뮬레이터 통과 |
| iOS 기본 실행 | 홈, 강제 종료 후 홈, 워치 앱 포함 빌드 | 시뮬레이터 검증 완료 |
| iOS 추가 UI | 루틴·기록·설정 이동, 운동 저장 후 재실행 | 시뮬레이터 XCTest 통과 |
| 건강 권한 | 거부 후 앱 사용 가능, 일부 허용 시 해당 값만 표시, 허용 철회 반영 | 두 플랫폼 실기기 대기 |
| 건강 기록 쓰기 | 테스트용 운동·체성분 내보내기, 동일 기록 재전송 시 중복 없음, 수정 체성분 반영 | 두 플랫폼 실기기 대기 |
| 워치 운동 전송 | 다음 세트 표시, 완료 전송, 연결 끊김 후 재연결해 한 번만 반영, 독립 운동 저장 | 두 플랫폼 실기기 대기 |
| 기기 설치·스토어 | 서명된 iOS 내부 배포 및 Google Play 내부 테스트에서 설치·실행 성공 | 개발자 계정·배포 서명 필요 |

Google Play 내부 테스트용 휴대폰 AAB는 Play 프로젝트와 업로드 서명이 연결된 환경에서 `npx eas-cli build --platform android --profile production`으로 생성합니다. Wear OS는 별도 AAB와 앱 서명의 일치 여부를 확인하고 해당 Wear OS 테스트 트랙에 등록합니다. 공개 배포 전 스토어의 건강 권한 선언, 개인정보처리방침 공개 URL, 스토어 등록 정보, 의존성 보안 점검을 완료합니다.

빌드와 실행 검증은 [v0.3.1 Actions 기록](https://github.com/M0lli2/form-fitness/actions/runs/44658112071)에서 확인하세요.
