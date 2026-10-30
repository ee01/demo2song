import Foundation
import D2SCore
#if canImport(WechatOpenSDK)
import WechatOpenSDK
#endif
@MainActor final class WechatBridge: NSObject {
 static let shared = WechatBridge()
 private var loginContinuation: CheckedContinuation<String, Error>?
 private var expectedState: String?
 private var configured = false
 private var loginTimeout: Task<Void, Never>?
 enum Failure: LocalizedError { case unavailable, cancelled, failed; var errorDescription: String? { switch self { case .unavailable: "请先配置微信 OpenSDK 和开放平台应用"; case .cancelled: "已取消微信授权"; case .failed: "微信授权失败" } } }
 func configure() {
  #if canImport(WechatOpenSDK)
  guard let appID = Bundle.main.object(forInfoDictionaryKey: "WECHAT_OPEN_APP_ID") as? String, appID.hasPrefix("wx"), let universalLink = Bundle.main.object(forInfoDictionaryKey: "UNIVERSAL_LINK") as? String, universalLink.hasPrefix("https://") else { return }
  configured = WXApi.registerApp(appID, universalLink: universalLink)
  #endif
 }
 func login() async throws -> String {
  #if canImport(WechatOpenSDK)
  guard configured, WXApi.isWXAppInstalled(), loginContinuation == nil else { throw Failure.unavailable }
  return try await withCheckedThrowingContinuation { continuation in
   loginContinuation = continuation
   loginTimeout = Task { [weak self] in
    do { try await Task.sleep(for: .seconds(60)); self?.loginContinuation?.resume(throwing: Failure.failed); self?.loginContinuation = nil } catch { }
   }
   let request = SendAuthReq(); request.scope = "snsapi_userinfo"; expectedState = UUID().uuidString; request.state = expectedState ?? ""
   WXApi.send(request) { success in if !success { Task { @MainActor in self.loginContinuation?.resume(throwing: Failure.failed); self.loginContinuation = nil; self.loginTimeout?.cancel() } } }
  }
  #else
  throw Failure.unavailable
  #endif
 }
 func handle(_ url: URL) -> Bool {
  #if canImport(WechatOpenSDK)
  return WXApi.handleOpen(url, delegate: self)
  #else
  return false
  #endif
 }
 func handle(_ activity: NSUserActivity) -> Bool {
  #if canImport(WechatOpenSDK)
  return WXApi.handleOpenUniversalLink(activity, delegate: self)
  #else
  return false
  #endif
 }
 func share(_ song: Song) async throws {
  #if canImport(WechatOpenSDK)
  guard configured else { throw Failure.unavailable }
  let object = WXMiniProgramObject(); object.webpageUrl = "\(Bundle.main.object(forInfoDictionaryKey: "SHARE_BASE") as? String ?? "")/p/\(song.id)"; object.userName = Bundle.main.object(forInfoDictionaryKey: "WECHAT_MINIPROGRAM_ID") as? String ?? ""; object.path = "pages/play/index?id=\(song.id)"
  let message = WXMediaMessage(); message.title = song.name; message.mediaObject = object
  let request = SendMessageToWXReq(); request.message = message; request.bText = false; request.scene = Int32(WXSceneSession.rawValue)
  try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in WXApi.send(request) { success in success ? continuation.resume() : continuation.resume(throwing: Failure.failed) } }
  #else
  throw Failure.unavailable
  #endif
 }
}
#if canImport(WechatOpenSDK)
extension WechatBridge: WXApiDelegate {
 nonisolated func onResp(_ response: BaseResp) {
  guard let auth = response as? SendAuthResp else { return }
  let errorCode = auth.errCode; let state = auth.state; let code = auth.code
  Task { @MainActor in
  defer { loginContinuation = nil; expectedState = nil; loginTimeout?.cancel(); loginTimeout = nil }
  guard errorCode == 0, state == expectedState, let code else { loginContinuation?.resume(throwing: Failure.cancelled); return }
  loginContinuation?.resume(returning: code)
 } }
}
#endif
