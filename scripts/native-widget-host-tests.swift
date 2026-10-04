import XCTest

final class WidgetInteractionTests: XCTestCase {
  func testSystemDispatchFromLiveActivity() throws {
    continueAfterFailure = false
    let app = XCUIApplication(bundleIdentifier:"com.arratima.aura")
    app.launchArguments = ["--arra-widget-ui-test", "--arra-widget-ui-test-reset"]
    app.launch()
    XCTAssertTrue(app.staticTexts["ACTIVITY READY"].waitForExistence(timeout:20))
    let springboard = XCUIApplication(bundleIdentifier:"com.apple.springboard")
    func expand() {
      XCUIDevice.shared.press(.home)
      springboard.coordinate(withNormalizedOffset:CGVector(dx:0.5,dy:0.025)).press(forDuration:1.5)
    }
    expand()
    let next = springboard.buttons["Следующий диалог"]
    XCTAssertTrue(next.waitForExistence(timeout:10), "Actual system Live Activity did not expose its next button")
    next.tap()
    XCTAssertTrue(springboard.staticTexts["2 / 2"].waitForExistence(timeout:10), "Actual system card did not re-render the selected dialog")
    app.activate()
    XCTAssertTrue(app.staticTexts["widget-test:second"].waitForExistence(timeout:10), "System tap did not change the shared selection")
    expand()
    let previous = springboard.buttons["Предыдущий диалог"]
    XCTAssertTrue(previous.waitForExistence(timeout:10))
    previous.tap()
    app.activate()
    XCTAssertTrue(app.staticTexts["widget-test:first"].waitForExistence(timeout:10))
    // The intent must also work when no app process remains alive.
    app.terminate()
    expand()
    XCTAssertTrue(next.waitForExistence(timeout:10))
    next.tap()
    app.activate()
    XCTAssertTrue(app.staticTexts["widget-test:second"].waitForExistence(timeout:10), "Cold app intent did not change selection")
  }

  func testOldActivityDoesNotHijackTargetSnapshot() {
    let app = XCUIApplication(bundleIdentifier:"com.arratima.aura")
    app.launchArguments = ["--arra-widget-ui-test", "--arra-widget-ui-test-reset", "--arra-widget-ui-test-multiple"]
    app.launch()
    XCTAssertTrue(app.staticTexts["MULTIPLE PASS"].waitForExistence(timeout:20))
    XCTAssertTrue(app.staticTexts["widget-test:second"].exists)
  }
}
