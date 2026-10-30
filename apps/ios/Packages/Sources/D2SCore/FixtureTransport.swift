#if DEBUG
import Foundation
public final class FixtureStore: SessionStore, @unchecked Sendable {
 private let lock = NSLock(); private var value: AuthResult?
 public init() { value = try? JSONDecoder().decode(AuthResult.self, from: FixtureTransport.auth) }
 public func read() -> AuthResult? { lock.withLock { value } }
 public func write(_ value: AuthResult) { lock.withLock { self.value = value } }
 public func clear() { lock.withLock { value = nil } }
}
public final class FixtureTransport: URLProtocol, @unchecked Sendable {
 public static func session() -> URLSession { let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [FixtureTransport.self]; return URLSession(configuration: configuration) }
 public static let auth = Data(#"{"accessToken":"fixture-access","refreshToken":"fixture-refresh","expiresIn":900,"user":{"id":"fixture-user","displayName":"晚风","identities":[{"provider":"wechat_mp","linkedAt":"2026-01-01T12:00:00Z"}]}}"#.utf8)
 private static let song = #"{"id":"fixture-song","stage":"demo","status":"ready","title":"旧街晚风","lyrics":"[Verse]\n风经过旧街角\n[Chorus]\n让旋律陪你到天明","durationSeconds":30}"#
 public override class func canInit(with request: URLRequest) -> Bool { true }
 public override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 public override func startLoading() {
  let path = request.url!.path
  let data: Data
  if path.contains("/auth/") { data = Self.auth }
  else if path.hasSuffix("/config/public") { data = Data(#"{"minRecordingSeconds":6,"maxRecordingSeconds":60,"enableFullSong":true}"#.utf8) }
  else if path.hasSuffix("/songs") { data = Data("{\"demos\":[\(Self.song)],\"fullSongs\":[]}".utf8) }
  else if path.contains("/songs/") { data = Data(Self.song.utf8) }
  else if path.hasSuffix("/me") { data = (try? JSONSerialization.data(withJSONObject: (JSONSerialization.jsonObject(with: Self.auth) as! [String: Any])["user"]!)) ?? Data() }
  else { data = Data("{}".utf8) }
  client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
  client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
 }
 public override func stopLoading() {}
}
#endif
