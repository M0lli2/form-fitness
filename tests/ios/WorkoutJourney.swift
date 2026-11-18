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
        XCTAssertTrue(app.buttons["+ 새 루틴 만들기"].waitForExistence(timeout: 10))
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
        tap("푸시업")
        XCTAssertTrue(app.staticTexts["3D 자세 가이드"].waitForExistence(timeout: 15))
        tap("동작 재생")
        XCTAssertTrue(app.staticTexts["동작 반복 재생 중"].waitForExistence(timeout: 10))
        tap("일시 정지")
        tap("회전")
        XCTAssertTrue(control("운동 관절과 장비의 3차원 자세, 오른쪽").exists)
        tap("확대")
        XCTAssertTrue(app.buttons["축소"].exists)
        attach("exercise-library-motion-guide")
    }
}
