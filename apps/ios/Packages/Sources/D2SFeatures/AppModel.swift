import SwiftUI
import Observation
import D2SCore
import D2SAudio
import D2SFlows
@MainActor @Observable public final class AppModel {
 public let api: APIClient
 public let recorder = Recorder()
 public let player = Player()
 public var user: Me?
 public var songs: [Song] = []
 public var selected: Song?
 public var prompt = Prompt()
 public var flow = GenerationFlow()
 public var jobID: String?
 public var busy = false
 public var error: String?
 public var status = ""
 public var consent = UserDefaults.standard.bool(forKey: "voiceConsent.v1")
 public var showConsent = false
 public var tab = 0
 public var minSeconds = 6.0
 public var maxSeconds = 60.0
 public var enableFull = true
 public var wechatLogin: (() async throws -> String)?
 public var wechatShare: ((Song) async throws -> Void)?
 public var requestNotifications: (() async -> Void)?
 public var progressUpdated: ((Job) async -> Void)?
 public var startActivity: ((String) async -> Void)?
 private var monitor: Task<Void, Never>?
 public init(api: APIClient) { self.api = api }
 public func load() async {
  user = await api.currentUser()
  do { let config: PublicConfig = try await api.request("config/public", authenticated: false); minSeconds = config.minRecordingSeconds; maxSeconds = config.maxRecordingSeconds; recorder.maxSeconds = maxSeconds; enableFull = config.enableFullSong } catch { self.error = error.localizedDescription }
  if user != nil { await library() }
 }
 public func login(path: String, body: Data) async { await run { let value: AuthResult = try await self.api.request(path, method: "POST", body: body, authenticated: false); try await self.api.setAuth(value); self.user = value.user; await self.library() } }
 public func library() async {
  do { let value: Library = try await api.request("songs"); songs = value.demos + value.fullSongs }
  catch { self.error = error.localizedDescription; if await api.currentUser() == nil { resetSession() } }
 }
 public func song(_ id: String) async { await run { self.selected = try await self.api.request("songs/\(id)") } }
 public func createDemo() async {
  guard consent else { showConsent = true; return }
  guard let file = recorder.file, recorder.seconds >= minSeconds else { error = "至少哼 \(Int(minSeconds)) 秒"; return }
  await run {
   self.flow = GenerationFlow(); self.flow.receive(.uploading); self.status = "正在上传录音"
   let record = try await self.api.upload(file: file, seconds: self.recorder.seconds)
   struct Body: Encodable { var recordingId: String; var prompt: Prompt }
   let job: JobCreated = try await self.api.request("songs/demo-jobs", method: "POST", body: try JSONEncoder().encode(Body(recordingId: record.id, prompt: self.prompt)))
   self.watch(job: job)
  }
 }
 public func createFull(song: Song, title: String, lyrics: String) async {
  await run {
   struct Body: Encodable { var title: String; var lyrics: String; var prompt: Prompt }
   let job: JobCreated = try await self.api.request("songs/\(song.id)/full-jobs", method: "POST", body: try JSONEncoder().encode(Body(title: title, lyrics: lyrics, prompt: self.prompt)))
   self.watch(job: job)
  }
 }
 public func watch(job: JobCreated) {
  monitor?.cancel(); jobID = job.jobId; flow = GenerationFlow(); flow.receive(.queued); status = "排队中，可离开此页面"; UserDefaults.standard.set(job.jobId, forKey: "activeJob")
  monitor = Task {
   await startActivity?(job.jobId)
   // SSE first, reconnect/poll fallback keeps progress available behind restrictive gateways.
   while !Task.isCancelled {
    do {
     for try await event in SSEClient().events(request: await api.eventRequest(jobID: job.jobId)) { if await apply(event) { return } }
    } catch { if Task.isCancelled { return } }
    do { let event: Job = try await api.request("jobs/\(job.jobId)"); if await apply(event) { return }; try await Task.sleep(for: .seconds(3)) }
    catch { if Task.isCancelled { return }; self.error = error.localizedDescription; if await api.currentUser() == nil { resetSession(); return }; try? await Task.sleep(for: .seconds(5)) }
   }
  }
 }
 private func apply(_ event: Job) async -> Bool {
  await progressUpdated?(event)
  if let state = GenerationState(rawValue: event.status) { flow.receive(state) }
  status = event.status == "running" ? "AI 正在编曲" : event.status == "queued" ? "排队中，可离开此页面" : event.status == "failed" ? "生成失败，请重新尝试" : "歌曲已完成"
  if event.status == "succeeded", let id = event.songId { UserDefaults.standard.removeObject(forKey: "activeJob"); jobID = nil; await song(id); await library(); return true }
  if event.status == "failed" { UserDefaults.standard.removeObject(forKey: "activeJob"); jobID = nil; error = event.errorCode ?? "生成失败"; return true }
  return false
 }
 public func restoreJob() { if let id = UserDefaults.standard.string(forKey: "activeJob"), user != nil { watch(job: JobCreated(jobId: id, songId: "", status: "queued")) } }
 public func resetSession() { monitor?.cancel(); monitor = nil; user = nil; songs = []; selected = nil; jobID = nil; player.pause(); recorder.discard(); UserDefaults.standard.removeObject(forKey: "activeJob") }
 public func acceptConsent() { consent = true; UserDefaults.standard.set(true, forKey: "voiceConsent.v1"); showConsent = false }
 public func run(_ action: () async throws -> Void) async { guard !busy else { return }; busy = true; defer { busy = false }; do { try await action() } catch { self.error = error.localizedDescription; if flow.state == .uploading { flow.receive(.failed) }; if await api.currentUser() == nil { resetSession() } } }
}
