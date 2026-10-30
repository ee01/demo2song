import XCTest
@testable import D2SCore
import D2SFlows
final class CoreTests: XCTestCase {
 func testFlowRejectsInvalidTransitions() {
  var flow = GenerationFlow(); flow.receive(.succeeded); XCTAssertEqual(flow.state, .idle)
  flow.receive(.uploading); flow.receive(.queued); flow.receive(.succeeded); XCTAssertEqual(flow.state, .succeeded)
 }
 func testLibraryHandlesMissingOptionalFields() throws {
  let data = Data(#"{"demos":[{"id":"demo-1","stage":"demo","status":"ready"}],"fullSongs":[]}"#.utf8)
  let library = try JSONDecoder().decode(Library.self, from: data)
  XCTAssertEqual(library.demos[0].name, "我的 Demo")
 }
 func testHTTPErrorShowsQuotaMessage() {
  XCTAssertEqual(APIError(status: 429, code: "DAILY_DEMO_QUOTA_EXHAUSTED", body: Data()).errorDescription, "今日生成次数已用完，明天再来")
 }
}
