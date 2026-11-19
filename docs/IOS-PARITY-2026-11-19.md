# iOS ↔ Android 기능 동기화 기록 — 2026-11-19

요청: "해당 레포에서 ios버전도 안드로이드 버전과 동일한 기능을 갖추게 업데이트해줘" (`M0lli2/form-fitness`)
추가 요청: "모든 업데이트는 기록을 남겨놔 나중에 내가 gpt로 작업해도 누락되는부분없게 적용할수있도록"

이 문서는 **다른 도구(GPT 등)가 이 저장소를 처음 열어도 오늘의 변경을 그대로 재적용·검증할 수 있도록** 감사 결과, 파일별 변경, 검증 결과, 남은 작업을 한곳에 남긴다. 요약은 [PROGRESS-2026-11-19.md](PROGRESS-2026-11-19.md) 7절에 링크되어 있다.

- 브랜치: `feat/ios-parity` (기준 `main` = `ad435f5`)
- 로컬 검증 원본 출력: [evidence/2026-11-19-ios-parity-local-tests.txt](evidence/2026-11-19-ios-parity-local-tests.txt)

---

## 1. 한눈에 보는 결론

| 질문 | 답 |
|---|---|
| 화면·기능(운동 기록, 3D 자세, 근육 필터, 주간 볼륨, 인바디, 백업, 테마·Glass)이 iOS에 없던 것이 있나? | **없다.** `src/`의 UI·도메인 코드를 두 플랫폼이 100% 공유하기 때문이다. iOS 전용 화면 구현이나 스텁은 0건이었다. |
| 실제로 달랐던 것은? | ① iOS **워치 앱 화면**(유산소·아이소메트릭 세트, 심박 표시), ② iOS **네이티브 브리지 동작**(워치 상태 전달 실패, 심박 조회 기간), ③ iOS **검증 커버리지**(UI 테스트 여정·계약 검사) |
| 이번에 고친 것 | 3건의 동작 차이 + 회귀 방지 검사 2종(스크립트, 단위 테스트) + iOS UI 테스트 2종 추가 |
| 의도적으로 남긴 차이 | Glass 재질(iOS 네이티브 / Android 블러 폴백), 시스템 폰트, 읽기 권한 거부 확인 불가(iOS 제약), 워치 앱의 iOS 추가 기능(일시정지·에너지·휴식 카운트다운) |
| 이 PR로 못 고친 것 | `.github/workflows/` 수정(토큰 권한 없음), `src/` 문구 2곳(아래 9절에 그대로 적용할 diff 제공), 실기기 검증 |

---

## 2. 감사 범위와 방법

`origin/main`(`ad435f5`) 전체를 읽고 다음을 비교했다.

| 범위 | 확인한 파일 | 방법 |
|---|---|---|
| 화면·도메인 | `src/App.tsx`, `src/theme.tsx`, `src/storage.ts`, `src/health.ts`, `src/types.ts`, `src/MotionGuide.tsx`, `src/WeeklyVolume.tsx`, `src/ui-v2/*` | `Platform.OS` 분기 전수 grep, 플랫폼별 파일(`*.ios.*`/`*.android.*`) 존재 여부, 기능별 렌더 경로 추적 |
| 네이티브 모듈 | `modules/form-device/ios/FormDeviceModule.swift`, `modules/form-device/android/**/FormDeviceModule.kt`, `HealthPermissionActivity.kt`, 양쪽 `AndroidManifest.xml`, `expo-module.config.json`, `FormDevice.podspec`, `index.ts` | 내보낸 메서드/이벤트·인자·반환·검증 규칙·저장 위치를 1:1 대조 |
| 구성 | `app.json`, `eas.json`, `package.json`, `plugins/withFormNative.cjs`, `watchos/project.yml`, `scripts/embed-watch.rb`, `watchos/FORMWatch.entitlements` | 권한·엔타이틀먼트·Info.plist 키·빌드 프로필·동반 앱 식별자 대조 |
| 워치 | `watchos/Sources/FORMWatchApp.swift` vs `wearos/app/src/main/java/com/mori/form/wear/{MainActivity,WorkoutService}.kt` + 양쪽 manifest | 화면 요소, 주고받는 메시지 필드, 운동 저장 주체, 백그라운드 동작 |
| CI·검증 | `.github/workflows/*.yml`, `scripts/runtime-smoke.py`, `scripts/runtime-journeys.py`, `tests/ios/WorkoutJourney.swift`, `scripts/configure-ios-tests.rb` | 플랫폼별 검사 항목과 실행 경로 비교 |

감사 명령 예시(그대로 재현 가능):

```sh
git clone https://github.com/M0lli2/form-fitness.git && cd form-fitness
grep -rn "Platform.OS" src modules plugins
grep -rn "AsyncFunction\|Events(" modules/form-device
diff <(grep -o 'AsyncFunction("[A-Za-z]*"' modules/form-device/ios/FormDeviceModule.swift | sort) \
     <(grep -o 'AsyncFunction("[A-Za-z]*"' modules/form-device/android/src/main/java/com/mori/form/device/FormDeviceModule.kt | sort)
```

---

## 3. 왜 화면 기능은 이미 같았나 (공유 코드 구조)

- `index.ts` → `src/App.tsx` 하나를 두 플랫폼이 같이 쓴다. iOS/Android용 별도 화면 파일(`*.ios.tsx`, `*.android.tsx`)은 **없다**.
- 플랫폼 분기는 아래 8곳이 전부이며, 모두 "표현 방식"만 바꾼다.

| 위치 | Android | iOS | 성격 |
|---|---|---|---|
| `src/theme.tsx:31` | `fontFamily: 'sans-serif'` | 시스템 기본 폰트 | 표현 |
| `src/ui-v2/Primitives.tsx:14` | `fontFamily: 'sans-serif'` | 시스템 기본 폰트 | 표현 |
| `src/ui-v2/Primitives.tsx:22` | `resolveMaterial(..., platform:'android')` → `frosted`(BlurView) | iOS 26+ `GlassView`, 미지원 시 `frosted` | 표현(문서화된 의도) |
| `src/ui-v2/Theme.tsx:18,22` | 투명도 감소 설정 미지원 → `false` | `AccessibilityInfo.isReduceTransparencyEnabled()` 구독 | 접근성 API 차이 |
| `src/App.tsx:410` | 설정 섹션 제목 `Health Connect · Samsung Health`, `Galaxy Watch · Wear OS` | `Apple 건강 · 피트니스`, `Apple Watch` | 문구 |
| `src/App.tsx:421` | `KeyboardAvoidingView behavior` 없음 | `behavior='padding'` | 키보드 처리 |
| `src/App.tsx:421`(모달) | 위와 동일 | 위와 동일 | 키보드 처리 |
| `src/health.ts` | 공통 코드(분기 없음) | 공통 코드 | — |

즉 "iOS에 안드로이드 기능이 없는" 종류의 결손은 UI 계층에 존재하지 않았다. 남은 차이는 네이티브 계층과 검증 계층이었다.

---

## 4. 발견한 차이 전부와 판정

### 4.1 네이티브 브리지 (휴대폰)

| # | 항목 | Android | iOS (수정 전) | 판정 | 조치 |
|---|---|---|---|---|---|
| B1 | 내보낸 메서드 | 9개 | 9개(동일) | 동일 | `scripts/check-project.mjs`가 자동 비교하도록 고정 |
| B2 | `authorize()` 반환 | 실제 허용된 권한이 있으면 `true` | HealthKit은 읽기 거부를 알려주지 않으므로 항상 `true` | **플랫폼 제약** | 유지, UI에 "권한 거부와 데이터 부재는 iOS에서 구분할 수 없습니다" 명시 |
| B3 | `readHealth()` 심박 | 최근 30일 범위의 최신 표본 | **기간 제한 없음** → 몇 달 전 값도 "최근 심박"으로 표시 | **불일치(수정)** | iOS에 30일 `since` 적용 |
| B4 | `readHealth()` 체중·체지방 | 최근 30일 범위 | 기간 제한 없음(최신 표본) | 의도적 유지 | iOS가 상위 집합. 30일 넘은 값도 보여줌(기능 손실 아님) |
| B5 | `readHealth()` 걸음 | 오늘 0시~현재 합계 | 동일 | 동일 | — |
| B6 | `readHealth()` 운동 | 30일, 최신 100건, `title` | 30일, 최신 100건, metadata `FormWorkoutName` | 동일 | — |
| B7 | `saveBody()` | `clientRecordId=form-<id>-weight/-fat`, `clientRecordVersion=revision` | `HKMetadataKeySyncIdentifier`+`SyncVersion` | 동일(중복 방지 의미 동일) | — |
| B8 | `saveBody()` 검증 | revision≥1, weight 20~400, fat 0~75 | 동일(+revision≤Int32) | 동일 | — |
| B9 | `saveWorkout()` | `ExerciseSessionRecord`, 근력, `title=name`, idempotent | `HKWorkout(.traditionalStrengthTraining)`, brand+이름 metadata, idempotent | 동일 | — |
| B10 | `watchStatus()` | `connected`=근처 노드, `paired`=연결된 노드 존재 | `connected`=`isReachable`, `paired`=페어링 && 워치 앱 설치 | 의미 동일(문구 3단계 동일) | — |
| B11 | `sendWatch()` | 워치 미연결이어도 DataClient에 마지막 상태 보존 | **세션 활성화 전이면 예외** → 상태 유실 | **불일치(수정)** | `PhoneWatchBridge.push`로 최신 상태 보관 후 활성화 시 전송 |
| B12 | `drainWatch()`/`ackWatch()` | SharedPreferences 큐, 본문 64,000자 제한, id 중복 제거 | UserDefaults 큐, 64,000자 제한, id 중복 제거 | 동일 | — |
| B13 | 워치 명령 수신 | `WearableListenerService`: 메시지 `/form/command` + 데이터 `/form/command/*` | `WCSession` `didReceiveMessage` + `didReceiveUserInfo` | 동일 | — |
| B14 | 앱이 종료된 동안 수신 | 서비스가 살아 있으면 수신·저장 | 다음 실행 시 전달(플랫폼 제약) | **플랫폼 제약** | 유지, 아래 8절에 기록 |

### 4.2 워치 앱

| # | 항목 | Wear OS | watchOS (수정 전) | 판정 | 조치 |
|---|---|---|---|---|---|
| W1 | 다음 세트 표시 | 근력 `kg × 회`, 그 외 `N초` | 항상 `kg × 회` → 유산소·아이소메트릭은 "0.0 kg × 0회" | **불일치(수정)** | `type`으로 분기, 그 외는 `N초` |
| W2 | 심박 표시 | 값이 없으면 "심박 측정 대기" | `♥ 0`(0 bpm) | **불일치(수정)** | 0이면 "심박 측정 대기" |
| W3 | 경과 시간 | 분:초 | `.timer` 스타일 | 동일 | — |
| W4 | 일시정지 | 없음 | 있음 | iOS 추가 기능 | 유지 |
| W5 | 에너지(kcal) | 없음 | 있음 | iOS 추가 기능 | 유지 |
| W6 | 휴식 남은 시간 | 없음 | 있음 | iOS 추가 기능 | 유지 |
| W7 | 세트 완료 전송 | `completeSet`(id, sessionId, exerciseId, setId) | 동일 | 동일 | 계약 검사로 고정 |
| W8 | 운동 완료 전송 | `workoutFinished`(start, end, healthSaved=false) | `workoutFinished`(+healthSaved=true) | 동일 계약, 저장 주체만 다름 | 아래 표 참고 |
| W9 | 운동 저장 주체 | 워치 → 휴대폰 기록 저장, Health Connect 쓰기는 휴대폰에서 별도 | 워치가 HealthKit에 직접 저장 후 휴대폰은 중복 저장 안 함 | **설계 차이** | 유지(양쪽 모두 기록 보존) |
| W10 | 독립 운동 | 전경 서비스 + 심박 센서 | `HKWorkoutSession` + `HKLiveWorkoutBuilder` | 동일 목적 | — |
| W11 | 백그라운드 모드 | `FOREGROUND_SERVICE_HEALTH` | `WKBackgroundModes=workout-processing` | 동일 목적 | — |

### 4.3 구성·빌드

| # | 항목 | Android | iOS | 판정 |
|---|---|---|---|---|
| C1 | 앱 식별자 | `com.mori.form` | `com.mori.form` | 동일 |
| C2 | 버전 | `versionCode 2` / `0.2.0` | `buildNumber 2` / `0.2.0` | 동일 |
| C3 | 동반 앱 | `wearos` applicationId `com.mori.form`, 같은 서명 필요 | `com.mori.form.watchkitapp`, `WKCompanionAppBundleIdentifier=com.mori.form` | 동일 |
| C4 | 건강 권한 | manifest 권한 9종(읽기 5·쓰기 3·알림 1) | `NSHealthShare/UpdateUsageDescription` + HealthKit 엔타이틀먼트 | 동일 범위 |
| C5 | 사진 | 시스템 포토피커(권한 불필요) | `NSPhotoLibraryUsageDescription` | 동일 |
| C6 | 최소 SDK | minSdk 28(플러그인이 고정) | iOS 15.1, watchOS 10.0 | 플랫폼 기준 |
| C7 | 백업 차단 | `allowBackup=false` + 플러그인 | 해당 없음(iOS 앱 데이터는 백업 대상) | 플랫폼 차이 |
| C8 | 알림 | `POST_NOTIFICATIONS` + 로컬 DATE 트리거 | 런타임 권한 + DATE 트리거 | 동일 |
| C9 | 네이티브 모듈 autolink | `expo-module.config.json` platforms `apple`,`android` | 동일 파일 | 동일 |
| C10 | `eas.json` | preview: `buildType apk` | preview: internal distribution | 차이 없음(플랫폼별 의미) |

### 4.4 검증(CI) 커버리지

| # | 항목 | Android | iOS (수정 전) | 판정 | 조치 |
|---|---|---|---|---|---|
| T1 | 소스 검사 | `Source checks` | 공통 | 동일 | iOS 계약 검사를 추가 |
| T2 | 런타임 스모크 | APK 설치 후 화면 5장 + XML 검사 | 시뮬레이터 설치·실행·재실행 + 홈 문구 OCR | 동일 수준 | — |
| T3 | 저장 데이터 여정 | `runtime-journeys.py`(테마 유지, Glass, 운동도감, 3D, 세트 완료, 일시정지/계속, 저장 종료, 재실행 후 기록 유지) | XCTest 2개(테마 유지·탐색, 3D 가이드) | **iOS 부족(보완)** | `testSavedWorkoutJourneyAndPersistence` 추가 |
| T4 | 설정 화면 항목 | 여정에서 간접 확인 | 없음 | **iOS 부족(보완)** | `testSettingsParitySections` 추가 |
| T5 | JS 번들 export | `npx expo export --platform android`만 | 없음 | **남은 항목** | `.github/workflows/checks.yml` 수정 필요(권한 없음, 9절) |

---

## 5. 이번에 바꾼 파일 (파일별 상세)

### 5.1 `modules/form-device/ios/FormDeviceModule.swift`

**(a) `sendWatch`: 활성화 전 호출을 큐잉** — B11

```swift
// 수정 전: 세션이 활성화되지 않았으면 예외를 던져 JS가 상태를 잃었다.
AsyncFunction("sendWatch") { (payload: String) throws in
  guard WCSession.isSupported(), WCSession.default.activationState == .activated else { throw FormError.watchUnavailable }
  try WCSession.default.updateApplicationContext(["payload": payload])
  if WCSession.default.isReachable { WCSession.default.sendMessage([...], replyHandler: nil, errorHandler: nil) }
}

// 수정 후: 지원 여부만 확인하고, 최신 상태를 브리지에 맡긴다.
AsyncFunction("sendWatch") { (payload: String) throws in
  guard WCSession.isSupported() else { throw FormError.watchUnavailable }
  self.watch.push(payload)
}
```

`PhoneWatchBridge`에 추가된 부분:

```swift
private var latest: String?                                   // 마지막 상태 1개(Android DataClient와 같은 의미)
func push(_ payload: String) { lock.lock(); latest = payload; lock.unlock(); flush() }
private func flush() {
  guard WCSession.isSupported(), WCSession.default.activationState == .activated else { activate(); return }
  lock.lock(); let text = latest; lock.unlock()
  guard let text = text else { return }
  guard (try? WCSession.default.updateApplicationContext(["payload": text])) != nil else { return }
  if WCSession.default.isReachable { WCSession.default.sendMessage(["payload": text], replyHandler: nil, errorHandler: nil) }
}
// 활성화 완료·비활성 후 재활성화 시점에 flush
func session(_:activationDidCompleteWith:error:) { if activationState == .activated { flush() } }
func sessionDidDeactivate(_ session: WCSession) { session.activate(); flush() }
```

동작: 워치가 없거나 앱 시작 직후여도 호출이 실패하지 않고, 세션이 활성화되면 마지막 상태가 전달된다. 전달 실패 시 `latest`를 유지해 다음 기회에 재시도한다(JS의 `Device.sendWatch(...).catch(()=>{})`가 더 이상 정상 상태를 삼키지 않는다).

**(b) `readHealth`: 심박 30일 창** — B3

```swift
// 수정 전: predicate 없이 가장 최근 표본
async let hr = self.latest(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()))
// 수정 후
async let hr = self.latest(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), since: Date().addingTimeInterval(-30 * 86400))

// latest(_:unit:since:) — since가 있을 때만 기간 predicate를 만든다.
private func latest(_ type: HKQuantityTypeIdentifier, unit: HKUnit, since: Date? = nil) async throws -> Double? {
  ...
  let predicate = since.map { HKQuery.predicateForSamples(withStart: $0, end: Date()) }
  let query = HKSampleQuery(..., predicate: predicate, limit: 1, ...)
}
```

체중·체지방 호출부는 그대로라 **동작 변화 없음**(B4의 의도적 유지를 코드로 보장).

### 5.2 `watchos/Sources/FORMWatchApp.swift`

```swift
// W1: 유산소·아이소메트릭 세트를 중량 대신 시간으로
if next["type"] as? String == "strength" {
  Text("\(next["weight"] as? Double ?? 0, specifier: "%.1f") kg × \(next["reps"] as? Int ?? 0)회").font(.caption)
} else {
  Text("\(next["seconds"] as? Int ?? 0)초").font(.caption)
}

// W2: 첫 심박 표본 전에는 0 bpm 대신 대기 문구
HStack {
  Text(model.heartRate > 0 ? "♥ \(Int(model.heartRate)) bpm" : "심박 측정 대기")
  Text("\(Int(model.energy)) kcal")
}.font(.caption)
```

전송 payload(`sessionId`, `exerciseId`, `setId`, `restEndsAt`, `healthSaved`)와 액션 이름은 그대로다.

### 5.3 `scripts/ios-parity.mjs` (신규)

의존성 없는 순수 함수 4개. 소스에서 계약을 직접 읽는다.

| 함수 | 역할 |
|---|---|
| `exportedMethods(source)` | `AsyncFunction("name")` 이름 추출(줄 주석 제외, 중복 제거, 정렬) |
| `declaredEvents(source)` | `Events("name")` 추출 |
| `methodParity(android, ios)` | `{android, ios, missingOnIos, missingOnAndroid}` |
| `missingTokens(source, tokens)` | 소스에 없는 문자열 목록(기능 표면 누락 검사) |

### 5.4 `scripts/check-project.mjs` (확장, `npm run check`)

기존 JSON 파싱·메서드 존재·앱 ID 검사에 다음을 추가했다. **CI의 `Source checks`가 매 push마다 실행**하므로 이후 iOS/Android가 어긋나면 PR이 바로 빨개진다.

1. 두 플랫폼 `AsyncFunction` 목록이 **정확히 같은 9개**(`ackWatch, authorize, drainWatch, healthAvailable, readHealth, saveBody, saveWorkout, sendWatch, watchStatus`)이고 `Events` 계약도 같음, `Name("FormDevice")` 동일.
2. 건강 레코드 대응 5쌍: `StepsRecord↔stepCount`, `HeartRateRecord↔heartRate`, `WeightRecord↔bodyMass`, `BodyFatRecord↔bodyFatPercentage`, `ExerciseSessionRecord↔workoutType`.
3. iOS 심박 조회가 `since:`로 제한될 것(정규식 검사).
4. 워치 양쪽이 `completeSet`·`workoutFinished`를 처리하고, iOS는 `type` 분기와 `seconds` 표시, "심박 측정 대기" 문구를 가질 것. 상태 필드(`sessionId`,`exerciseId`,`setId`,`restEndsAt`,`healthSaved`) 존재.
5. `app.json` iOS `infoPlist` 3종 사용 설명, HealthKit 엔타이틀먼트, `watchos/FORMWatch.entitlements`, `watchos/project.yml`·`scripts/embed-watch.rb`의 동반 앱 메타데이터.
6. Android 권한 9종, `expo-module.config.json` 플랫폼 목록, `./plugins/withFormNative.cjs` 등록 여부.
7. 동반 앱 식별자 `com.mori.form`.

### 5.5 `tests/ios-parity.test.mjs` (신규)

`node --test` 기반 7개 테스트. 파서 동작(주석 무시, 한쪽에만 있는 메서드 탐지), 실제 저장소 소스의 메서드·건강 레코드·워치 액션 동등성을 검사한다. `npm test`에 포함되어 73 → **80개**가 되었다.

### 5.6 `tests/ios/WorkoutJourney.swift` (확장)

| 테스트 | 검증 내용 |
|---|---|
| `testSavedWorkoutJourneyAndPersistence` (신규) | 홈 `운동 시작하기` → 루틴 `기본에 충실한 전신` → `고블릿 스쿼트` 집중 화면 → `세트 완료` → `2번째 세트` → `일시정지` → `일시정지됨` → `계속하기` → `운동 종료` → `저장하고 종료` → `최근 6주 운동 볼륨` + 히스토리 카드 → **앱 종료/재실행** → `기록`에서 동일 기록 유지. Android `runtime-journeys.py`와 같은 경로. |
| `testSettingsParitySections` (신규) | iOS 설정에 `Apple 건강 · 피트니스`, `Apple Watch`, `백업 파일 내보내기`가 있는지(=Android와 같은 항목) |

기존 두 테스트(테마 유지·탐색, 3D 가이드)는 수정하지 않았다.

### 5.7 `docs/evidence/2026-11-19-ios-parity-local-tests.txt` (신규)

로컬 `npm test` / `npm run check` / `npm run typecheck` 실제 출력.

---

## 6. 바꾸지 않은 파일과 이유

| 파일 | 왜 그대로인가 |
|---|---|
| `app.json` | iOS `infoPlist`(건강 읽기/쓰기·사진), HealthKit 엔타이틀먼트, Android 권한 9종, 플러그인 목록이 이미 양쪽 기능을 덮는다. 빈 곳이 없어 수정하지 않았다(검사로 고정만 함). |
| `eas.json` | preview/production 프로필이 플랫폼별로 필요한 값을 이미 갖고 있다(`android.buildType: apk`, iOS internal). |
| `plugins/withFormNative.cjs` | Android 전용 설정(minSdk 28, allowBackup=false). iOS 쪽 같은 설정은 `app.json`이 담당하므로 대응 코드가 필요 없다. |
| `watchos/project.yml` | 번들 ID·동반 앱 ID·HealthKit 사용 설명·백그라운드 모드가 `embed-watch.rb` 생성 값과 일치. 버전도 0.2.0/2로 동일. |
| `watchos/FORMWatch.entitlements` | HealthKit 엔타이틀먼트 포함(검사 추가). |
| `src/**` | 공유 코드라 iOS 결손이 없었다. 아래 9절의 문구 2건은 이 PR에서 건드리지 않았다(이유 포함). |
| `.github/workflows/**` | 연결된 토큰에 `workflows` 권한이 없어 push가 거부된다. 필요한 변경은 9절에 diff로 남긴다. |

---

## 7. 네이티브 계약 (수정 후 최종 상태)

`modules/form-device/index.ts`의 타입과 두 구현이 일치한다. 반환은 모두 Promise.

| 메서드 | iOS(Swift) | Android(Kotlin) | 반환 |
|---|---|---|---|
| `healthAvailable` | `HKHealthStore.isHealthDataAvailable()` | `HealthConnectClient.getSdkStatus(...) == SDK_AVAILABLE` | `Bool` |
| `authorize` | `requestAuthorization(toShare:read:)` → `true` | `HealthPermissionActivity.request` → 허용 집합 비어있지 않음 | `Bool` |
| `readHealth` | 걸음(오늘 합계)·심박(30일 최신)·체중·체지방·운동(30일 100건) | 동일(권한별 개별 조회) | `{steps, heartRate, weight, bodyFat, workouts[]}` |
| `saveBody(id,date,weight,fat,revision)` | HKQuantitySample 2종, SyncIdentifier | WeightRecord/BodyFatRecord, clientRecordId | `Void` |
| `saveWorkout(id,name,start,end)` | HKWorkout(근력) | ExerciseSessionRecord(근력, title) | `Void` |
| `watchStatus` | `{connected: isReachable, paired: isPaired && isWatchAppInstalled}` | `{connected: 근처 노드, paired: 노드 존재}` | `{connected, paired}` |
| `sendWatch(payload)` | `push` → `applicationContext`+`sendMessage` | DataClient `/form/state` put | `Void` |
| `drainWatch` | UserDefaults 큐 | SharedPreferences 큐 | `[String]` |
| `ackWatch(ids)` | 큐에서 id 제거 | 큐에서 id 제거 | `Void` |

권한·엔타이틀먼트 대응표:

| 기능 | Android | iOS |
|---|---|---|
| 걸음 | `android.permission.health.READ_STEPS` | `NSHealthShareUsageDescription` + `stepCount` 읽기 |
| 심박 | `READ_HEART_RATE` | 동일 설명 + `heartRate` 읽기 |
| 체중 | `READ_WEIGHT` / `WRITE_WEIGHT` | 동일 설명 + `bodyMass` 읽기·쓰기 |
| 체지방 | `READ_BODY_FAT` / `WRITE_BODY_FAT` | `bodyFatPercentage` 읽기·쓰기 |
| 운동 | `READ_EXERCISE` / `WRITE_EXERCISE` | `workoutType` 읽기·쓰기 |
| 알림 | `POST_NOTIFICATIONS` | 런타임 권한(Info.plist 키 불필요) |
| 사진 | 시스템 포토피커 | `NSPhotoLibraryUsageDescription` |
| 엔타이틀먼트 | `queries`(Health Connect 패키지), rationale/privacy 액티비티 | `com.apple.developer.healthkit`(앱·워치), `WKBackgroundModes=workout-processing`, `WKCompanionAppBundleIdentifier=com.mori.form` |

---

## 8. 검증

### 8.1 로컬 (이 작업 환경, Linux)

| 명령 | 결과 |
|---|---|
| `npm ci --ignore-scripts` | 성공(Node 22.14.0) |
| `npm test` | **80/80 통과**(기존 73 + 신규 7) |
| `npm run check` | `JSON, iOS/Android bridge, health types, watch actions, entitlements and companion identifiers: OK` |
| `npm run typecheck` (`tsc --noEmit`) | 성공 |
| `python3 -m py_compile scripts/runtime-smoke.py scripts/runtime-journeys.py` | 성공(변경 없음, CI와 동일 단계) |

이 환경에는 Xcode/macOS·Android SDK·시뮬레이터가 없어 **Swift/Kotlin 컴파일과 실기기 실행은 로컬에서 확인할 수 없다.** 아래 CI가 그 역할을 한다.

### 8.2 GitHub Actions

| 워크플로 | 실행 | 결과 |
|---|---|---|
| `Source checks` | [44495574243](https://github.com/M0lli2/form-fitness/actions/runs/44495574243) | 성공(47초) — 새 계약 검사·80개 테스트·타입 검사·Android 번들 export 포함 |
| `iOS runtime smoke` | [44495574253](https://github.com/M0lli2/form-fitness/actions/runs/44495574253) | **성공** — Release 빌드 → 시뮬레이터 설치·첫 실행·홈 문구 OCR → 종료 후 재실행까지 통과, XCTest **4/4 통과**(`Executed 4 tests, with 0 failures in 114.4s`, `** TEST SUCCEEDED **`). 새 저장 여정 포함 |
| `Native build validation` | [44491139222](https://github.com/M0lli2/form-fitness/actions/runs/44491139222) | 성공 — apple: iOS+watchOS 컴파일·`Form.app/Watch/FORMWatch.app` 임베드 확인, android: APK, wearos: APK. 첫 시도에서 android 잡만 `Could not find com.google.code.gson:gson:2.9.1`(Maven 해석 오류)로 실패해 재실행 후 성공. 코드와 무관한 외부 의존성 오류다 |
| `Android runtime smoke` | [44491139301](https://github.com/M0lli2/form-fitness/actions/runs/44491139301) | 성공(11분) — APK 빌드 후 에뮬레이터 구동 |
| `Android UI repack regression` | 실행되지 않음 | 트리거 경로(`src/**`)를 건드리지 않아 생략. **9.1의 선행 조건 참고** |

첫 iOS 실행([44491139369](https://github.com/M0lli2/form-fitness/actions/runs/44491139369))에서는 새 여정 테스트가 마지막 히스토리 확인(당시 파일 82행)에서 1회 실패했다(접근성 레이블 병합, 8.3 참고). 그 앞 단계(운동 시작 → 세트 완료 → 일시정지/계속 → 저장 종료 → 기록 화면)는 모두 통과했고, 테스트만 고친 뒤 위 실행에서 4/4 통과했다. 제품 코드는 이 실패 때문에 바꾸지 않았다.

### 8.3 iOS UI 테스트를 쓸 때 알아야 할 것 (이번에 확인)

- React Native `Pressable`은 `accessible=true`가 기본이라 **카드 안의 텍스트가 하나의 접근성 레이블로 합쳐진다**. 운동 히스토리 카드의 `기본에 충실한 전신`은 `app.staticTexts["..."]`로 찾히지 않고, `matching(NSPredicate(format: "label CONTAINS %@", ...))`로 찾아야 한다. 이 때문에 첫 실행에서 여정 테스트가 한 번 실패했고(그 앞 단계는 모두 통과), 테스트만 고쳐 해결했다.
- 알림·확인 창은 네이티브라 `app.alerts.firstMatch.buttons["저장하고 종료"]`처럼 레이블로 직접 누른다. 기본 버튼은 시뮬레이터 언어에 따라 `OK`/`확인`으로 달라지므로 `buttons.firstMatch`를 쓴다.
- `Section` 제목은 `accessibilityRole='header'`인 staticText로 노출되므로 `app.staticTexts["최근 6주 운동 볼륨"]` 패턴이 동작한다(기존 테스트와 동일).

### 8.4 이번 검증이 보증하지 않는 것

- 실기기 HealthKit/Health Connect 권한 허용·거부·부분 허용·취소 흐름
- iPhone ↔ Apple Watch, 휴대폰 ↔ Galaxy Watch 실제 페어링과 백그라운드 전달
- 서명된 EAS 배포·스토어 설치
- 워치 화면의 시각적 품질(스크린샷 검수)

---

## 9. 남은 작업 (다음 사람이 그대로 적용할 것)

### 9.1 `Android UI repack regression` 기준 커밋 올리기 — **선행 조건**

이 워크플로의 `prepare` 잡은 `package.json`, `package-lock.json`, `app.json`, `modules`, `plugins`를 **0.2.0 기준 커밋 `c4452e4`와 바이트 비교**한다. 이번 PR은 iOS 네이티브(`modules/form-device/ios`)를 바꿨으므로, 다음에 `src/**`가 push되어 이 워크플로가 실행되면 diff가 생겨 실패한다. 기준을 현재 `main`으로 올려야 한다.

```diff
-      - run: git diff --exit-code c4452e4792243e61ddb1dc84adc3ff63a904ca2c HEAD -- package.json package-lock.json app.json modules plugins
+      # 네이티브 브리지가 바뀐 커밋(이 PR의 머지 커밋)을 기준으로 삼는다. 기준 바이너리와 같은 시점이어야 한다.
+      - run: git diff --exit-code <이 PR 머지 커밋 SHA> HEAD -- package.json package-lock.json app.json modules plugins
```

`run-id`와 `Base native commit`도 같은 시점의 성공한 `Android runtime smoke` 실행으로 함께 바꿔야 provenance가 맞는다(현재 `run-id: 44476921003`, `0.2.0`).

### 9.2 iOS JS 번들도 CI에서 검사하기

현재 `Source checks`는 `npx expo export --platform android`만 만든다. iOS 번들에서만 터지는 import/플랫폼 오류를 잡으려면 `.github/workflows/checks.yml`에 한 줄을 추가한다.

```diff
       - run: npx expo export --platform android --output-dir /tmp/form-bundle --source-maps
+      - run: npx expo export --platform ios --output-dir /tmp/form-bundle-ios --source-maps
       - run: node scripts/report-runtime-dependencies.mjs /tmp/form-bundle
```

### 9.3 플랫폼별 문구 2곳 (`src/App.tsx` 설정 화면)

공유 문구가 상대 플랫폼 이야기를 하고 있다. **이 PR에서 고치지 않은 이유**: `src/**`를 push하면 9.1의 가드가 이 PR에서 즉시 실패하며, 워크플로를 고칠 권한이 이 작업에 없다. 9.1을 먼저 적용한 뒤 아래를 반영하면 된다.

```diff
-<Label muted size={11}>권한 거부와 데이터 부재는 iOS에서 구분할 수 없습니다.</Label>
+<Label muted size={11}>{Platform.OS === 'ios' ? '권한 거부와 데이터 부재는 iOS에서 구분할 수 없습니다.' : 'Health Connect에서 허용한 항목만 표시됩니다.'}</Label>

-<Label muted size={12}>동일한 앱을 워치에도 설치해야 합니다. Galaxy Watch4 이후 Wear OS 기기가 대상이며 Tizen 기기는 지원하지 않습니다.</Label>
+<Label muted size={12}>{Platform.OS === 'ios' ? '동일한 앱을 Apple Watch에도 설치해야 합니다. iPhone과 페어링된 워치에서 기록할 수 있습니다.' : '동일한 앱을 워치에도 설치해야 합니다. Galaxy Watch4 이후 Wear OS 기기가 대상이며 Tizen 기기는 지원하지 않습니다.'}</Label>
```

### 9.4 워치에서 기록한 운동을 휴대폰에서 건강 앱으로 내보내는 경로 (양쪽 공통)

`src/health.ts`의 `exportWorkout`은 `src/App.tsx:19`에서 import만 되고 **호출 지점이 없다**. 그래서 Android는 Wear OS에서 저장한 운동(`sync:'watch'`)이 Health Connect로 넘어가지 않고, iOS도 워치가 직접 저장하지 못한 경우 휴대폰에서 내보낼 UI가 없다. 플랫폼 동등성 문제는 아니지만(둘 다 없음) 기능 공백이므로 기록해 둔다. 구현 시: 히스토리 상세 모달에 `session.external && session.sync === 'watch'` 조건의 "건강 앱에 내보내기" 버튼을 추가하고 `exportWorkout(session)`을 호출한다.

### 9.5 iOS 배포(IPA) 파이프라인이 없다

Android는 릴리스 APK를 워크플로로 만들고 서명 일치까지 검사하지만, iOS는 `iOS runtime smoke`·`Native build validation`의 **서명 없는 시뮬레이터 빌드**뿐이다. TestFlight/스토어용 IPA를 만드는 워크플로는 없으며, 현재는 [INSTALL.md](INSTALL.md)의 Xcode Archive 절차를 따른다. 자동화하려면 EAS Build(iOS 프로필 + App Store Connect API 키) 또는 macOS 러너에서 `xcodebuild archive/export` 단계가 필요하다. 둘 다 `.github/workflows/` 수정과 서명 비밀이 필요해 이 PR에서 제외했다.

### 9.6 실기기 검증 체크리스트

- [ ] iPhone: HealthKit 권한 허용/거부/부분 허용, 걸음·심박·체중·체지방 표시, 체성분 내보내기 후 건강 앱 확인
- [ ] iPhone: 일시정지 후 백그라운드 복귀 시 타이머·휴식 알림 정확성
- [ ] Apple Watch: 페어링, 다음 세트 표시(근력/유산소), 세트 완료 전달, 독립 운동 저장, 심박 표시
- [ ] iPhone 재실행 후 워치 마지막 상태 전달(이번 `push` 수정 검증)
- [ ] Galaxy Watch: 동일 항목(Wear OS 경로 회귀 확인)
- [ ] 알림: Android 채널·iOS 권한 거부 상태에서 앱이 계속 동작하는지

---

## 10. GPT로 이어서 작업할 때 체크리스트

1. `git fetch origin && git checkout feat/ios-parity` (또는 머지된 `main`). PR: <https://github.com/M0lli2/form-fitness/pull/4>
2. 이 문서의 5절 파일 6개가 실제 코드와 같은지 확인 → 다르면 4절 표로 되돌아가 차이를 다시 판정.
3. `npm ci --ignore-scripts && npm test && npm run check && npm run typecheck` → 80/80, `OK`, 타입 성공이어야 한다.
4. 계약을 바꿨다면 `scripts/ios-parity.mjs`의 파서나 `scripts/check-project.mjs`의 `contract` 배열을 **함께** 갱신한다(둘 중 하나만 바꾸면 검사가 실패한다).
5. 워치 메시지 필드를 바꿨다면 `watchos/Sources/FORMWatchApp.swift`, `wearos/.../MainActivity.kt`, `wearos/.../WorkoutService.kt`, `src/App.tsx`의 `pollWatch()`·`sendWatch` payload를 **네 곳 모두** 맞춘다.
6. iOS 네이티브를 건드렸다면 9.1의 repack 기준 커밋을 반드시 함께 올린다.
7. PR을 올린 뒤 `Source checks`, `iOS runtime smoke`, `Native build validation` 결과를 확인하고, 실패하면 해당 run의 로그로 원인을 고친 뒤 같은 브랜치에 다시 push한다.

---

## 11. 참고

- 이전 상태 기록: [INTEGRATION-STATUS.md](INTEGRATION-STATUS.md), [VALIDATION.md](VALIDATION.md), [PROGRESS-2026-11-19.md](PROGRESS-2026-11-19.md)
- 설치·서명: [INSTALL.md](INSTALL.md)
- UI 규격: [UI-V2-VALIDATION.md](UI-V2-VALIDATION.md), [DESIGN-SOURCES.md](DESIGN-SOURCES.md)
