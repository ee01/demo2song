import XCTest
final class SuihengUITests: XCTestCase {
 func testLoginControlsAreAccessible() {
  let app = XCUIApplication(); app.launchArguments = ["-harness", "-screen", "login", "-state", "idle", "-fixture", "user-new"]; app.launch()
  XCTAssertTrue(app.buttons["login.wechat"].waitForExistence(timeout: 10)); XCTAssertTrue(app.buttons["login.apple"].exists)
 }
 func testCapture() throws {
  let cases: [(String,String)] = [("login","idle"),("record","idle"),("compose","filled"),("library","ready"),("song","ready"),("account","ready")]
  for (screen,state) in cases {
   let app=XCUIApplication(); app.launchArguments=["-harness","-screen",screen,"-state",state,"-fixture","user-with-songs"]; app.launch()
   XCTAssertTrue(app.wait(for:.runningForeground,timeout:10))
   let predicate=NSPredicate(format:"identifier != ''"); let elements=app.descendants(matching:.any).matching(predicate).allElementsBoundByIndex
   let tree=elements.filter{ $0.exists && !$0.identifier.isEmpty }.map { ["id":$0.identifier,"text":$0.label,"box":["x":$0.frame.minX,"y":$0.frame.minY,"width":$0.frame.width,"height":$0.frame.height]] as [String:Any] }
   let name="\(screen)__\(state)@iphone-15"
   let screenshot=XCTAttachment(screenshot:app.screenshot()); screenshot.name=name+".png"; screenshot.lifetime = .keepAlways;add(screenshot)
   let nodes=XCTAttachment(data:try JSONSerialization.data(withJSONObject:tree),uniformTypeIdentifier:"public.json");nodes.name=name+".tree.json";nodes.lifetime = .keepAlways;add(nodes)
   app.terminate()
  }
 }
}
