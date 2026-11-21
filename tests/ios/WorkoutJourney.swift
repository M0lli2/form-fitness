import XCTest

/// Black-box native UI checks. Data is created through visible controls, never injected.
final class WorkoutJourney: XCTestCase {
    let app = XCUIApplication(bundleIdentifier: "com.mori.form")
    override func setUpWithError() throws {
        continueAfterFailure = false
        app.launch()
        XCTAssertTrue(app.staticTexts["오늘도, 나의 페이스로."].waitForExistence(timeout: 30))
    }
    func control(_ label: String) -> XCUIElement {
        return app.descendants(matching: .any).matching(identifier: label).firstMatch
    }
    /// 카드처럼 여러 텍스트가 하나의 접근성 레이블로 합쳐진 요소를 찾습니다.
    func element(containing text: String) -> XCUIElement {
        return app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@", text)).firstMatch
    }
    func tap(_ label: String) {
        let element = control(label)
        XCTAssertTrue(element.waitForExistence(timeout: 15), "Missing control: " + label)
        element.tap()
    }
    func attach(_ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
    func testThemePersistenceAndNavigation() {
        tap("루틴")
        XCTAssertTrue(app.buttons["+ 새 루틴"].waitForExistence(timeout: 10))
        tap("기록")
        XCTAssertTrue(app.staticTexts["최근 6주 운동 볼륨"].waitForExistence(timeout: 10))
        tap("내 정보")
        XCTAssertTrue(app.staticTexts["화면 스타일"].waitForExistence(timeout: 10))
        tap("다크")
        attach("dark-settings")
        app.terminate()
        app.launch()
        tap("내 정보")
        let dark = control("다크")
        XCTAssertTrue(dark.waitForExistence(timeout: 15))
        XCTAssertTrue(dark.isSelected, "Dark preference was not restored")
        tap("라이트")
        attach("light-settings")
    }
    func testExerciseLibraryMotionGuide() {
        tap("운동도감")
        tap("근육 모형으로 찾기")
        XCTAssertTrue(control("도감 근육 모형 · 앞면").waitForExistence(timeout: 15))
        tap("배면")
        XCTAssertTrue(control("도감 근육 모형 · 배면").waitForExistence(timeout: 15))
        tap("근육 모형 접기")
        tap("푸시업")
        XCTAssertTrue(app.staticTexts["3D 자세 가이드"].waitForExistence(timeout: 15))
        tap("동작 재생")
        XCTAssertTrue(app.staticTexts["동작 반복 재생 중"].waitForExistence(timeout: 10))
        tap("일시 정지")
        tap("회전")
        let rotated = app.descendants(matching: .any).matching(
            NSPredicate(format: "label BEGINSWITH %@", "운동 관절과 장비의 3차원 자세, 오른쪽")
        ).firstMatch
        XCTAssertTrue(rotated.waitForExistence(timeout: 10))
        tap("확대")
        XCTAssertTrue(app.buttons["축소"].exists)
        attach("exercise-library-motion-guide")
    }
    func testExerciseWithoutKeyframesShowsAnatomy() {
        tap("운동도감")
        tap("니 푸시업")
        XCTAssertTrue(control("니 푸시업 근육 모형 · 앞면").waitForExistence(timeout: 15))
        attach("catalog-static-anatomy-front")
        tap("배면")
        XCTAssertTrue(control("니 푸시업 근육 모형 · 배면").waitForExistence(timeout: 15))
        attach("catalog-static-anatomy-back")
    }
    func testPreparedWorkoutAllowsEditingBeforeStart() {
        tap("루틴")
        tap("빈 운동 시작")
        tap("운동 추가")
        tap("푸시업")
        tap("이 운동 추가")
        let field = app.textFields["푸시업 1세트 중량"]
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        field.tap()
        if let value = field.value as? String {
            if value != "42" {
                // Moving to the end clears either a selected value or an insertion caret.
                field.typeText(XCUIKeyboardKey.delete.rawValue)
                field.typeText("42")
            }
        }
        XCTAssertTrue(control("준비 중 · 0:00").exists)
        XCTAssertFalse(control("푸시업 1세트 완료").exists)
        attach("prepared-workout-editable")
        tap("운동 시작")
        XCTAssertTrue(control("일시정지").waitForExistence(timeout: 15))
        XCTAssertEqual(field.value as? String, "42")
        tap("운동 종료")
        tap("기록 없이 종료")
        XCTAssertTrue(control("빈 운동 시작").waitForExistence(timeout: 15))
    }

    /// Android `Android saved-data journeys`와 같은 경로를 iOS에서 확인합니다.
    /// 홈 → 루틴 시작 → 세트 완료 → 일시정지·계속 → 종료 저장 → 기록 → 강제 종료 후 재실행.
    func testSavedWorkoutJourneyAndPersistence() {
        tap("운동 시작하기")
        tap("기본에 충실한 전신")
        XCTAssertTrue(app.staticTexts["고블릿 스쿼트"].waitForExistence(timeout: 20))
        tap("세트 완료")
        XCTAssertTrue(app.staticTexts["2번째 세트"].waitForExistence(timeout: 15))
        attach("focused-set-completed")
        tap("일시정지")
        let paused = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "일시정지됨")).firstMatch
        XCTAssertTrue(paused.waitForExistence(timeout: 10))
        tap("계속하기")
        tap("운동 종료")
        // 종료 확인과 저장 완료 알림은 네이티브 알림이므로 레이블로 직접 누릅니다.
        let confirmation = app.alerts.firstMatch
        XCTAssertTrue(confirmation.waitForExistence(timeout: 15))
        confirmation.buttons["저장하고 종료"].tap()
        let saved = app.alerts.firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 20))
        saved.buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["최근 6주 운동 볼륨"].waitForExistence(timeout: 20))
        // 히스토리 카드는 세션 이름(루틴 이름)을 포함한 하나의 접근성 레이블로 합쳐집니다.
        XCTAssertTrue(element(containing: "기본에 충실한 전신").waitForExistence(timeout: 15))
        attach("saved-workout-history")
        // 한 주의 세트가 반영된 근육 볼륨 카드도 함께 남깁니다.
        app.swipeUp()
        attach("weekly-volume-filled")
        // 프로세스를 종료해도 운동 기록이 SQLCipher DB에서 복원되는지 확인합니다.
        app.terminate()
        app.launch()
        tap("기록")
        XCTAssertTrue(app.staticTexts["최근 6주 운동 볼륨"].waitForExistence(timeout: 20))
        XCTAssertTrue(element(containing: "기본에 충실한 전신").waitForExistence(timeout: 15))
        attach("persisted-workout-history")
    }
    /// iOS 설정 화면에 Android와 같은 건강·워치·데이터 항목이 있는지 확인합니다.
    func testSettingsParitySections() {
        tap("내 정보")
        XCTAssertTrue(app.staticTexts["화면 스타일"].waitForExistence(timeout: 15))
        for label in ["Apple 건강 · 피트니스", "Apple Watch"] {
            XCTAssertTrue(app.staticTexts[label].waitForExistence(timeout: 10), "Missing settings section: " + label)
        }
        XCTAssertTrue(app.buttons["백업 파일 내보내기"].waitForExistence(timeout: 10), "Missing backup action")
        attach("ios-settings-parity")
    }
    /// 기록 탭의 주간 근육 볼륨 카드. 모델과 안내 문구가 겹치지 않는지 눈으로 확인할 캡처를 남깁니다.
    func testWeeklyVolumeCardCapture() {
        tap("기록")
        XCTAssertTrue(app.staticTexts["최근 6주 운동 볼륨"].waitForExistence(timeout: 20))
        app.swipeUp()
        let card = element(containing: "이번 주 근육 볼륨")
        XCTAssertTrue(card.waitForExistence(timeout: 15), "Missing weekly volume card")
        attach("weekly-volume-card")
    }
}
