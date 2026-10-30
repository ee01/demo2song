import SwiftUI
import AuthenticationServices
import D2SCore
import D2SDesign
import D2SAudio
import D2SStrings
public struct RootView: View {
 @Bindable var model: AppModel
 public init(model: AppModel) { self.model = model }
 public var body: some View {
  #if DEBUG
  if let screen = HarnessScreen.selected { HarnessScreen(model: model, screen: screen) }
  else { appContent }
  #else
  appContent
  #endif
 }
 private var appContent: some View {
  Group {
   if model.user == nil { LoginView(model: model) }
   else {
    TabView(selection: $model.tab) {
     NavigationStack { RecordView(model: model) }.tabItem { Label("哼一段", systemImage: "mic.fill") }.tag(0)
     NavigationStack { LibraryView(model: model) }.tabItem { Label("作品", systemImage: "music.note.list") }.tag(1)
     NavigationStack { AccountView(model: model) }.tabItem { Label("账号", systemImage: "person.crop.circle") }.tag(2)
    }
   }
  }.tint(Theme.accent).preferredColorScheme(.dark)
   .background(Theme.background)
   .task { await model.load(); model.restoreJob() }
   .sheet(item: $model.selected) { song in NavigationStack { SongView(model: model, song: song) } }
   .sheet(isPresented: $model.showConsent) { ConsentView(model: model) }
   .alert("提示", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("知道了") { model.error = nil } } message: { Text(model.error ?? "") }
 }
}
struct LoginView: View {
 @Bindable var model: AppModel
 var body: some View {
  VStack(spacing: 28) {
   Spacer(); Image(systemName: "waveform").font(.system(size: 64)).foregroundStyle(Theme.accent)
   Text(Copy.text("app.name")).font(.largeTitle.bold()); Text(Copy.text("record.title")).font(.title2)
   Text("用微信登录，继续使用小程序中的作品与账号").foregroundStyle(.secondary).multilineTextAlignment(.center)
   Spacer()
   PrimaryButton("微信登录", busy: model.busy) { Task { await model.run { guard let login = model.wechatLogin else { throw LoginError.notConfigured }; let code = try await login(); let auth: AuthResult = try await model.api.request("auth/wechat-app", method: "POST", body: try JSONEncoder().encode(["code": code]), authenticated: false); try await model.api.setAuth(auth); model.user = auth.user; await model.library() } } }.accessibilityIdentifier("login.wechat")
   SignInWithAppleButton(.signIn) { request in request.requestedScopes = [.fullName, .email] } onCompletion: { result in
    Task { do {
     let authorization = try result.get(); guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential, let token = apple.identityToken, let code = apple.authorizationCode else { throw LoginError.invalidCredential }
     await model.login(path: "auth/apple", body: try JSONEncoder().encode(["identityToken": String(decoding: token, as: UTF8.self), "authorizationCode": String(decoding: code, as: UTF8.self), "fullName": apple.fullName.map { PersonNameComponentsFormatter().string(from: $0) } ?? ""]))
    } catch { model.error = error.localizedDescription } }
   }.signInWithAppleButtonStyle(.white).frame(height: 50).accessibilityIdentifier("login.apple")
   Text("登录后可阅读声纹授权协议；录音仅用于你选择的歌曲生成").font(.footnote).foregroundStyle(.secondary)
  }.padding(24).background(Theme.background)
 }
 enum LoginError: LocalizedError { case notConfigured, invalidCredential; var errorDescription: String? { self == .notConfigured ? "尚未配置微信开放平台应用，请完成真机配置" : "未获得有效授权" } }
}
struct RecordView: View {
 @Bindable var model: AppModel
 @State private var showingCompose = false
 @State private var holding = false
 var body: some View {
  ScrollView {
   VStack(spacing: 24) {
    Text(Copy.text("record.title")).font(.largeTitle.bold()).accessibilityIdentifier("record.title")
    Text(Copy.text("record.subtitle")).foregroundStyle(.secondary)
    Waveform(level: model.recorder.level)
    Text(String(format: "%.1f 秒", model.recorder.seconds)).font(.title.monospacedDigit())
    Text("建议 \(Int(model.minSeconds))–\(Int(model.maxSeconds)) 秒").foregroundStyle(.secondary)
    Button {} label: { Image(systemName: model.recorder.recording ? "stop.fill" : "mic.fill").font(.system(size: 42)).frame(width: 112, height: 112).background(Theme.accent.opacity(0.2), in: Circle()) }
     .accessibilityIdentifier("record.hold")
     .gesture(DragGesture(minimumDistance: 0).onChanged { value in
      guard model.consent else { model.showConsent = true; return }
      if !holding && !model.busy {
       holding = true; model.busy = true
       Task { await model.recorder.start(); model.busy = false; if !holding { model.recorder.stop() }; if let error = model.recorder.error { model.error = error } }
      }
      if value.translation.height < -70 { model.recorder.locked = true }
     }.onEnded { _ in holding = false; if !model.recorder.locked { model.recorder.stop() } })
    Text(model.recorder.locked ? "录音已锁定，点击停止" : "按住录音 · 上滑锁定").font(.footnote)
    if model.recorder.locked { PrimaryButton("停止录音") { model.recorder.stop() } }
    if model.recorder.file != nil && !model.recorder.recording {
     PrimaryButton("试听录音") { if let file = model.recorder.file { model.player.play(url: file, title: "我的哼唱") } }
     PrimaryButton("补充信息") { showingCompose = true }.disabled(model.recorder.seconds < model.minSeconds).accessibilityIdentifier("record.next")
     Button("重新录制") { model.recorder.discard() }
    }
    if model.jobID != nil { Card { ProgressView(); Text(model.status) }.accessibilityIdentifier("generating.status") }
   }.padding(24)
  }.background(Theme.background).navigationTitle("随哼")
   .navigationDestination(isPresented: $showingCompose) { ComposeView(model: model) }
 }
}
struct ComposeView: View {
 @Bindable var model: AppModel
 var body: some View {
  Form {
   Section("歌曲风格") { TextField("风格", text: $model.prompt.style); TextField("情绪", text: $model.prompt.mood) }
   Section("演唱") {
    Picker("语言", selection: $model.prompt.language) { Text("自动").tag("auto"); Text("中文").tag("zh"); Text("英文").tag("en") }
    Picker("人声", selection: $model.prompt.vocalGender) { Text("自动").tag("auto"); Text("女声").tag("female"); Text("男声").tag("male"); Text("混合").tag("mixed") }
   }
   Section("灵感与歌词（选填）") { TextField("描述你想表达的故事", text: $model.prompt.description, axis: .vertical); TextEditor(text: $model.prompt.lyricSeed).frame(minHeight: 100) }
   Section { PrimaryButton(model.jobID == nil ? "生成 Demo" : model.status, busy: model.busy) { Task { await model.createDemo() } }.disabled(model.jobID != nil).accessibilityIdentifier("compose.submit") }
  }.navigationTitle("补充信息")
 }
}
struct LibraryView: View {
 @Bindable var model: AppModel
 var body: some View {
  List {
   if model.songs.isEmpty { ContentUnavailableView("还没有作品", systemImage: "music.note", description: Text("哼一段旋律，创作第一首歌")) }
   ForEach(model.songs) { song in Button { Task { await model.song(song.id) } } label: { VStack(alignment: .leading) { Text(song.name).font(.headline); Text(song.status == "ready" ? "AI 生成 · \(song.stage == "demo" ? "Demo" : "完整版")" : song.status == "failed" ? "生成失败" : "生成中").font(.caption).foregroundStyle(.secondary) } } }
  }.refreshable { await model.library() }.navigationTitle("我的作品").accessibilityIdentifier("library.list")
 }
}
struct SongView: View {
 @Bindable var model: AppModel
 let song: Song
 @State private var full = false
 @State private var exportFile: URL?
 var body: some View {
  ScrollView { VStack(alignment: .leading, spacing: 24) {
   Text(song.name).font(.largeTitle.bold()).accessibilityIdentifier("song.title")
   Text("AI 生成").font(.caption).foregroundStyle(Theme.accent).accessibilityIdentifier("song.ai-label")
   if song.status == "ready", let string = song.playbackUrl, let url = URL(string: string) {
    Card {
     PrimaryButton(model.player.playing ? "暂停" : "播放") { if model.player.playing { model.player.pause() } else { model.player.play(url: url, title: song.name) } }.accessibilityIdentifier("song.play")
     Slider(value: Binding(get: { min(model.player.progress, max(1, model.player.duration)) }, set: { model.player.seek($0) }), in: 0...max(1, model.player.duration))
    }
    if let base = Bundle.main.object(forInfoDictionaryKey: "SHARE_BASE") as? String, let share = URL(string: "\(base)/p/\(song.id)") { ShareLink(item: share) { Label("分享歌曲", systemImage: "square.and.arrow.up") } }
    if let share = model.wechatShare { Button("分享到微信") { Task { await model.run { try await share(song) } } } }
    if let exportFile { ShareLink(item: exportFile) { Label("导出已下载音频", systemImage: "square.and.arrow.up") } }
    else { Button("保存音频") { Task { await model.run {
     let (temporary, response) = try await URLSession.shared.download(from: url)
     guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.badServerResponse) }
     let destination = URL.temporaryDirectory.appendingPathComponent("suiheng-\(song.id).mp3")
     if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
     try FileManager.default.moveItem(at: temporary, to: destination); exportFile = destination
    } } } }
    if song.stage == "demo" && model.enableFull { PrimaryButton("创作完整版") { full = true }.accessibilityIdentifier("song.full") }
   } else { Text(song.status == "failed" ? "生成失败，请返回重新创作" : "生成中，请稍后刷新") }
   Text(song.lyrics ?? "纯音乐 / 暂无歌词").textSelection(.enabled).accessibilityIdentifier("song.lyrics")
  }.padding(24) }.navigationTitle("歌曲").toolbar { ToolbarItem(placement: .cancellationAction) { Button("关闭") { model.selected = nil } } }
   .navigationDestination(isPresented: $full) { FullComposeView(model: model, song: song) }
 }
}
struct FullComposeView: View {
 @Bindable var model: AppModel; let song: Song
 @State private var title = ""; @State private var lyrics = ""
 var body: some View {
  Form {
   Section("歌词草稿") { PrimaryButton("AI 生成歌词", busy: model.busy) { Task { await model.run { let value: LyricsDraft = try await model.api.request("songs/\(song.id)/full-draft", method: "POST", body: Data("{}".utf8)); title = value.title; lyrics = value.lyrics } } } }
   TextField("标题", text: $title).accessibilityIdentifier("full-compose.title")
   TextEditor(text: $lyrics).frame(minHeight: 260).accessibilityIdentifier("full-compose.lyrics")
   PrimaryButton("生成完整版", busy: model.busy) { Task { await model.createFull(song: song, title: title, lyrics: lyrics) } }.disabled(lyrics.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.jobID != nil).accessibilityIdentifier("full-compose.submit")
  }.navigationTitle("创作完整版")
 }
}
struct ConsentView: View {
 @Bindable var model: AppModel
 var body: some View { NavigationStack { ScrollView { VStack(alignment: .leading, spacing: 24) { Text("声纹授权协议").font(.title.bold()); Text("你确认拥有所上传录音的合法使用权，并授权随哼将本次录音发送至音乐生成服务，用于生成你请求的歌曲。请勿上传他人未经授权的声音。录音及生成作品保存在你的账号下，可在账号页申请注销。生成结果含 AI 生成标识。"); PrimaryButton("同意并继续") { model.acceptConsent() }; Button("暂不同意") { model.showConsent = false } }.padding(24) } } }
}
struct AccountView: View {
 @Bindable var model: AppModel
 @State private var deleting = false
 @State private var mergeData: Data?
 @State private var mergeMessage = ""
 var body: some View {
  Form {
   Section("当前账号") { Text(model.user?.displayName ?? "随哼创作者"); ForEach(model.user?.identities ?? [], id: \.provider) { Text($0.provider == "apple" ? "Apple" : "微信") } }
   Section("绑定账号") {
    Button("绑定微信") { Task { await linkWechat() } }
    SignInWithAppleButton(.continue) { $0.requestedScopes = [.fullName] } onCompletion: { result in Task {
     do { let auth = try result.get(); guard let apple = auth.credential as? ASAuthorizationAppleIDCredential, let token = apple.identityToken, let code = apple.authorizationCode else { return }; await link(try JSONEncoder().encode(["provider": "apple", "identityToken": String(decoding: token, as: UTF8.self), "authorizationCode": String(decoding: code, as: UTF8.self)])) } catch { model.error = error.localizedDescription }
    } }.frame(height: 44)
   }
   Section { Button("开启生成完成通知") { Task { await model.requestNotifications?() } }; Button("查看声纹授权") { model.showConsent = true }; Button("退出登录") { Task { await model.run { try await model.api.logout(); model.resetSession() } } }; Button("注销账号", role: .destructive) { deleting = true } }
  }.navigationTitle("账号")
   .confirmationDialog("确认注销账号？会立即退出并撤销登录授权，作品和录音将在30天后清理。", isPresented: $deleting, titleVisibility: .visible) { Button("确认注销", role: .destructive) { Task { await model.run { let _: EmptyResponse = try await model.api.request("me", method: "DELETE"); try await model.api.clearAuth(); model.resetSession() } } } }
   .alert("确认合并账号", isPresented: Binding(get: { mergeData != nil }, set: { if !$0 { mergeData = nil } })) { Button("合并", role: .destructive) { guard let data = mergeData else { return }; mergeData = nil; Task { await model.run { let auth: AuthResult = try await model.api.request("me/merge", method: "POST", body: data); try await model.api.setAuth(auth); model.user = auth.user; await model.library() } } }; Button("取消", role: .cancel) { mergeData = nil } } message: { Text(mergeMessage) }
 }
 private func linkWechat() async { do { guard let login = model.wechatLogin else { throw LoginView.LoginError.notConfigured }; let code = try await login(); await link(try JSONEncoder().encode(["provider": "wechat_app", "code": code])) } catch { model.error = error.localizedDescription } }
 private func link(_ data: Data) async {
  do { model.user = try await model.api.request("me/identities", method: "POST", body: data) }
  catch let error as APIError where error.code == "MERGE_REQUIRED" {
   if let root = try? JSONSerialization.jsonObject(with: error.body) as? [String: Any], let failure = root["error"] as? [String: Any], let params = failure["params"] as? [String: Any], let token = params["mergeToken"] as? String {
    let current = params["current"] as? [String: Any]; let target = params["target"] as? [String: Any]
    mergeMessage = "将把当前账号的 \(current?["songCount"] as? Int ?? 0) 首歌并入目标账号（\(target?["songCount"] as? Int ?? 0) 首歌），继续吗？"
    mergeData = try? JSONEncoder().encode(["mergeToken": token])
   }
  } catch { model.error = error.localizedDescription }
 }
}

#if DEBUG
struct HarnessScreen: View {
 @Bindable var model: AppModel
 let screen: String
 @State private var fixtureSong: Song?
 static var selected: String? {
  let args = ProcessInfo.processInfo.arguments
  guard args.contains("-harness"), let index = args.firstIndex(of: "-screen"), args.indices.contains(index+1) else { return nil }; return args[index+1]
 }
 var body: some View {
  NavigationStack {
   switch screen {
   case "login": LoginView(model: model)
   case "record": RecordView(model: model)
   case "compose": ComposeView(model: model)
   case "library": LibraryView(model: model)
   case "account": AccountView(model: model)
   case "consent-voiceprint": ConsentView(model: model)
   case "generating": VStack { ProgressView(); Text(model.status).accessibilityIdentifier("generating.status") }
   case "full-compose": if let song = fixtureSong { FullComposeView(model: model, song: song) }
   default: if let song = fixtureSong { SongView(model: model, song: song) }
   }
  }.preferredColorScheme(.dark)
   .sheet(isPresented: $model.showConsent) { ConsentView(model: model) }
   .alert("提示", isPresented: Binding(get: { model.error != nil }, set: { if !$0 { model.error = nil } })) { Button("知道了") { model.error = nil } } message: { Text(model.error ?? "") }
   .task {
   await model.load()
   fixtureSong = try? await model.api.request("songs/fixture-song")
   let args = ProcessInfo.processInfo.arguments
   if let index = args.firstIndex(of:"-state"), args.indices.contains(index+1) {
    let state = args[index+1]; model.status = state == "queued" ? "排队中，可离开此页面" : state == "running" ? "AI 正在编曲" : state
    if screen == "library" && state == "empty" { model.songs = [] }
   }
  }
 }
}
#endif
