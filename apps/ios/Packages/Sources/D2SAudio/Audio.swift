import Foundation
import AVFoundation
import Observation
#if os(iOS)
import MediaPlayer
#endif
private final class AudioFileWriter: @unchecked Sendable {
 let file: AVAudioFile
 let lock = NSLock()
 init(url: URL) throws {
  file = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 128000], commonFormat: .pcmFormatFloat32, interleaved: false)
 }
 func append(_ buffer: AVAudioPCMBuffer) throws -> Float {
  try lock.withLock { try file.write(from: buffer) }
  guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
  var total: Float = 0
  for index in 0..<Int(buffer.frameLength) { total += samples[index] * samples[index] }
  return min(1, sqrt(total / Float(buffer.frameLength)) * 5)
 }
}
@MainActor @Observable public final class Recorder {
 public private(set) var recording = false
 public private(set) var seconds: Double = 0
 public private(set) var level: Float = 0
 public private(set) var file: URL?
 public var locked = false
 public var error: String?
 private var engine: AVAudioEngine?
 private var mixer: AVAudioMixerNode?
 private var writer: AudioFileWriter?
 private var startedAt: Date?
 private var timer: Timer?
 public var maxSeconds: Double = 60
 private struct Draft: Codable { var filename: String; var seconds: Double }
 private static var draftURL: URL { URL.documentsDirectory.appendingPathComponent("Drafts/current.json") }
 public init() {
  if let data = try? Data(contentsOf: Self.draftURL), let draft = try? JSONDecoder().decode(Draft.self, from: data) {
   let url = Self.draftURL.deletingLastPathComponent().appendingPathComponent(draft.filename)
   if FileManager.default.fileExists(atPath: url.path) { file = url; seconds = draft.seconds }
  }
 }
 public func start() async {
  guard !recording else { return }
  do {
   #if os(iOS)
   let permitted = await AVAudioApplication.requestRecordPermission()
   guard permitted else { error = "请在设置中允许使用麦克风"; return }
   let session = AVAudioSession.sharedInstance(); try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth]); try session.setActive(true)
   #endif
   let directory = URL.documentsDirectory.appendingPathComponent("Drafts"); try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
   let url = directory.appendingPathComponent("\(UUID().uuidString).m4a")
   let engine = AVAudioEngine(); let mixer = AVAudioMixerNode(); engine.attach(mixer)
   let inputFormat = engine.inputNode.outputFormat(forBus: 0)
   guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else { throw CocoaError(.fileWriteUnknown) }
   engine.connect(engine.inputNode, to: mixer, format: inputFormat)
   let mono = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
   engine.connect(mixer, to: engine.mainMixerNode, format: mono)
   engine.mainMixerNode.outputVolume = 0
   let writer = try AudioFileWriter(url: url)
   mixer.installTap(onBus: 0, bufferSize: 1024, format: mono) { [weak self, writer] buffer, _ in
    do { let level = try writer.append(buffer); Task { @MainActor in self?.level = level } }
    catch { let message = error.localizedDescription; Task { @MainActor in self?.error = message; self?.stop() } }
   }
   self.engine = engine; self.mixer = mixer; self.writer = writer
   engine.prepare(); try engine.start()
   file = url; recording = true; seconds = 0; error = nil; startedAt = .now
   timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in Task { @MainActor in
    guard let self else { return }; self.seconds = Date().timeIntervalSince(self.startedAt ?? .now)
    if self.seconds >= self.maxSeconds { self.stop() }
   } }
  } catch { self.error = error.localizedDescription; stop() }
 }
 public func stop() {
  if recording { seconds = min(maxSeconds, Date().timeIntervalSince(startedAt ?? .now)) }
  let wasRecording = recording
  engine?.stop(); mixer?.removeTap(onBus: 0); engine = nil; mixer = nil; writer = nil
  timer?.invalidate(); timer = nil; recording = false; locked = false; level = 0
  if wasRecording, let file, seconds > 0, let data = try? JSONEncoder().encode(Draft(filename: file.lastPathComponent, seconds: seconds)) { try? data.write(to: Self.draftURL, options: .atomic) }
 }
 public func discard() { stop(); if let file { try? FileManager.default.removeItem(at: file) }; file = nil; seconds = 0; try? FileManager.default.removeItem(at: Self.draftURL) }
}
@MainActor @Observable public final class Player {
 public private(set) var playing = false
 public private(set) var progress: Double = 0
 public private(set) var duration: Double = 0
 public var error: String?
 private var player: AVPlayer?
 private var observer: Any?
 public init() {
  #if os(iOS)
  MPRemoteCommandCenter.shared().playCommand.addTarget { [weak self] _ in Task { @MainActor in self?.resume() }; return .success }
  MPRemoteCommandCenter.shared().pauseCommand.addTarget { [weak self] _ in Task { @MainActor in self?.pause() }; return .success }
  MPRemoteCommandCenter.shared().changePlaybackPositionCommand.addTarget { [weak self] event in
   guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }; let position = event.positionTime
   Task { @MainActor in self?.seek(position) }; return .success
  }
  #endif
 }
 public func play(url: URL, title: String) {
  do {
   #if os(iOS)
   try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default); try AVAudioSession.sharedInstance().setActive(true)
   MPNowPlayingInfoCenter.default().nowPlayingInfo = [MPMediaItemPropertyTitle: title, MPNowPlayingInfoPropertyPlaybackRate: 1]
   #endif
   if let observer { player?.removeTimeObserver(observer) }
   player = AVPlayer(url: url)
   observer = player?.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] time in Task { @MainActor in
    guard let self else { return }; self.progress = time.seconds; let duration = self.player?.currentItem?.duration.seconds ?? 0; self.duration = duration.isFinite ? duration : 0
    #if os(iOS)
    MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPNowPlayingInfoPropertyElapsedPlaybackTime] = self.progress
    #endif
    if self.duration > 0 && self.progress >= self.duration { self.playing = false }
   } }
   resume()
  } catch { self.error = error.localizedDescription }
 }
 public func resume() { player?.play(); playing = true; updateRate(1) }
 public func pause() { player?.pause(); playing = false; updateRate(0) }
 public func seek(_ value: Double) { player?.seek(to: CMTime(seconds: value, preferredTimescale: 600)) }
 private func updateRate(_ value: Double) {
  #if os(iOS)
  MPNowPlayingInfoCenter.default().nowPlayingInfo?[MPNowPlayingInfoPropertyPlaybackRate] = value
  #endif
 }
}
