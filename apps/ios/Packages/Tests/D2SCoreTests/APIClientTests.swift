import XCTest
@testable import D2SCore
final class TestStore: SessionStore, @unchecked Sendable {
 let lock = NSLock(); private var value: AuthResult?
 func read() -> AuthResult? { lock.withLock { value } }
 func write(_ value: AuthResult) { lock.withLock { self.value = value } }
 func clear() { lock.withLock { value = nil } }
}
final class TestProtocol: URLProtocol, @unchecked Sendable {
 final class State: @unchecked Sendable {
  let lock = NSLock(); var refreshCount = 0; var refreshStatus = 200
  func response(_ request: URLRequest) -> (Int, Data) { lock.withLock {
   if request.url!.path.hasSuffix("auth/refresh") { refreshCount += 1; if refreshStatus != 200 { return (refreshStatus, Data(#"{"error":{"code":"TOKEN_INVALID"}}"#.utf8)) }; return (200, FixtureTransport.auth) }
   if request.value(forHTTPHeaderField: "Authorization") != "Bearer fixture-access" { return (401, Data(#"{"error":{"code":"TOKEN_EXPIRED"}}"#.utf8)) }
   return (200, Data(#"{"id":"fixture-user","identities":[]}"#.utf8))
  } }
 }
 static let state = State()
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() { let (status,data) = Self.state.response(request); client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed); client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self) }
 override func stopLoading() {}
}
final class APIClientTests: XCTestCase, @unchecked Sendable {
 func client(refreshStatus: Int = 200) throws -> (APIClient, TestStore) {
  TestProtocol.state.lock.withLock { TestProtocol.state.refreshCount = 0; TestProtocol.state.refreshStatus = refreshStatus }
  let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [TestProtocol.self]
  let store = TestStore(); var auth = try JSONDecoder().decode(AuthResult.self, from: FixtureTransport.auth); auth.accessToken = "expired"; store.write(auth)
  return (APIClient(baseURL: URL(string:"https://fixture.test/v1")!, session: URLSession(configuration: configuration), store: store), store)
 }
 func testExpiredRequestRefreshesAndRetries() async throws {
  let (api, store) = try client(); let me: Me = try await api.request("me"); XCTAssertEqual(me.id, "fixture-user"); XCTAssertEqual(store.read()?.accessToken,"fixture-access"); XCTAssertEqual(TestProtocol.state.refreshCount,1)
 }
 func testRejectedRefreshClearsStoredSession() async throws {
  let (api, store) = try client(refreshStatus:401)
  do { let _: Me = try await api.request("me"); XCTFail("Expected rejection") } catch { XCTAssertNil(store.read()) }
 }
 func testTransientRefreshFailureKeepsStoredSession() async throws {
  let (api, store) = try client(refreshStatus:503)
  do { let _: Me = try await api.request("me"); XCTFail("Expected failure") } catch { XCTAssertNotNil(store.read()) }
 }
}
