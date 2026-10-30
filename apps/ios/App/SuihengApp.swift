import SwiftUI
import D2SCore
import D2SFeatures
import UserNotifications
import ActivityKit
@main struct SuihengApp: App {
 @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
 @State private var model: AppModel
 init() {
  let base = URL(string: Bundle.main.object(forInfoDictionaryKey: "API_BASE") as? String ?? "http://127.0.0.1:3100/v1")!
  #if DEBUG
  if ProcessInfo.processInfo.arguments.contains("-harness") || (Bundle.main.object(forInfoDictionaryKey: "D2S_HARDWARE_TEST") as? Bool == true) {
   _model = State(initialValue: AppModel(api: APIClient(baseURL: base, session: FixtureTransport.session(), store: FixtureStore(), initialAuth: try? JSONDecoder().decode(AuthResult.self, from: FixtureTransport.auth))))
  } else { _model = State(initialValue: AppModel(api: APIClient(baseURL: base))) }
  #else
  _model = State(initialValue: AppModel(api: APIClient(baseURL: base)))
  #endif
 }
 var body: some Scene {
  WindowGroup {
   RootView(model: model).task {
    delegate.model = model
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-harness") || (Bundle.main.object(forInfoDictionaryKey: "D2S_HARDWARE_TEST") as? Bool == true) { model.wechatLogin = { "fixture-code" } }
    else { model.wechatLogin = { try await WechatBridge.shared.login() } }
    #else
    model.wechatLogin = { try await WechatBridge.shared.login() }
    #endif
    model.wechatShare = { try await WechatBridge.shared.share($0) }
    model.requestNotifications = {
     do { if try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { UIApplication.shared.registerForRemoteNotifications() } }
     catch { model.error = error.localizedDescription }
    }
    model.progressUpdated = { event in
     for activity in Activity<GenerationAttributes>.activities {
      let content = ActivityContent(state: GenerationAttributes.ContentState(status: event.status, title: event.status == "succeeded" ? "歌曲已完成" : event.status == "failed" ? "生成失败" : "AI 正在编曲", songId: event.songId), staleDate: nil)
      if event.status == "succeeded" || event.status == "failed" { await activity.end(content, dismissalPolicy: .after(.now.addingTimeInterval(3600))) } else { await activity.update(content) }
     }
    }
    model.startActivity = { jobID in await beginActivity(jobID: jobID) }
    WechatBridge.shared.configure()
   }.overlay(alignment: .top) {
    #if DEBUG
    if Bundle.main.object(forInfoDictionaryKey: "D2S_HARDWARE_TEST") as? Bool == true { Text("离线硬件测试 · 不连接真实账号").font(.caption).padding(6).background(.orange).foregroundStyle(.black).allowsHitTesting(false) }
    #endif
   }.onOpenURL { url in
    if WechatBridge.shared.handle(url) { return }
    if url.host == "record" { model.tab = 0 }
    else if url.pathComponents.count >= 3 && url.pathComponents[1] == "p" { Task { await model.song(url.lastPathComponent) } }
   }.onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
    guard let url = activity.webpageURL else { return }
    if WechatBridge.shared.handle(activity) { return }
    Task { await model.song(url.lastPathComponent) }
   }
  }
 }
 @MainActor private func beginActivity(jobID: String) async {
  guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
  do {
   let activity = try Activity<GenerationAttributes>.request(attributes: .init(jobID: jobID), content: .init(state: .init(status: "queued", title: "正在创作歌曲", songId: nil), staleDate: nil), pushType: .token)
   Task {
    for await token in activity.pushTokenUpdates {
     let value = token.map { String(format: "%02x", $0) }.joined()
     do { let _: EmptyResponse = try await model.api.request("jobs/\(jobID)/subscriptions", method: "POST", body: try JSONEncoder().encode(["channel": "apns_live_activity", "token": value])) } catch { model.error = error.localizedDescription }
    }
   }
  } catch { model.error = error.localizedDescription }
 }
}
@MainActor final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
 var model: AppModel?
 static var apnsEnvironment: String {
  #if DEBUG
  "sandbox"
  #else
  "production"
  #endif
 }
 nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
  let id = response.notification.request.content.userInfo["songId"] as? String
  if let id { await openSong(id) }
 }
 private func openSong(_ id: String) async { await model?.song(id) }
 func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool { UNUserNotificationCenter.current().delegate = self; return true }
 func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
  let token = deviceToken.map { String(format: "%02x", $0) }.joined()
  Task { do { struct Device: Encodable { var apnsToken: String; var env: String }; let _: EmptyResponse? = try await model?.api.request("me/devices", method: "POST", body: try JSONEncoder().encode(Device(apnsToken: token, env: Self.apnsEnvironment))) } catch { model?.error = error.localizedDescription } }
 }
}
