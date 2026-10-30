import Foundation
public struct Me: Codable, Sendable { public var id: String; public var displayName: String?; public var identities: [Identity]; public struct Identity: Codable, Sendable { public var provider: String; public var linkedAt: String } }
public struct AuthResult: Codable, Sendable { public var accessToken: String; public var refreshToken: String; public var expiresIn: Int; public var user: Me }
public struct Prompt: Codable, Sendable {
 public var style = "流行"; public var mood = "温暖"; public var language = "auto"; public var vocalGender = "auto"; public var description = ""; public var lyricSeed = ""
 public init() {}
 public init(from decoder: Decoder) throws {
  let values = try decoder.container(keyedBy: CodingKeys.self)
  style = try values.decodeIfPresent(String.self, forKey: .style) ?? "流行"
  mood = try values.decodeIfPresent(String.self, forKey: .mood) ?? "温暖"
  language = try values.decodeIfPresent(String.self, forKey: .language) ?? "auto"
  vocalGender = try values.decodeIfPresent(String.self, forKey: .vocalGender) ?? "auto"
  description = try values.decodeIfPresent(String.self, forKey: .description) ?? ""
  lyricSeed = try values.decodeIfPresent(String.self, forKey: .lyricSeed) ?? ""
 }
}
public struct Song: Codable, Identifiable, Sendable, Hashable {
 public var id: String; public var stage: String; public var status: String; public var title: String?; public var playbackUrl: String?; public var lyrics: String?; public var durationSeconds: Double?; public var jobId: String?; public var prompt: Prompt?; public var parentDemoId: String?; public var recordingPlaybackUrl: String?
 public var name: String { title ?? (stage == "demo" ? "我的 Demo" : "我的完整歌曲") }
}
extension Prompt: Hashable {}
public struct Library: Codable, Sendable { public var demos: [Song]; public var fullSongs: [Song] }
public struct Job: Codable, Sendable { public var id: String?; public var status: String; public var songId: String?; public var errorCode: String? }
public struct JobCreated: Codable, Sendable { public var jobId: String; public var songId: String; public var status: String; public init(jobId: String, songId: String, status: String) { self.jobId = jobId; self.songId = songId; self.status = status } }
public struct Recording: Codable, Sendable { public var id: String; public var durationSeconds: Double }
public struct UploadTicket: Codable, Sendable { public var recordingId: String; public var putUrl: URL; public var headers: [String: String]; public var expiresAt: String }
public struct LyricsDraft: Codable, Sendable { public var title: String; public var lyrics: String; public var styleTags: String? }
public struct PublicConfig: Codable, Sendable { public var minRecordingSeconds: Double; public var maxRecordingSeconds: Double; public var enableFullSong: Bool }
public struct EmptyResponse: Codable, Sendable { public init() {} }
public struct APIError: Error, LocalizedError, Sendable {
 public var status: Int; public var code: String; public var body: Data
 public var errorDescription: String? { switch code { case "DAILY_DEMO_QUOTA_EXHAUSTED", "DAILY_FULL_QUOTA_EXHAUSTED": "今日生成次数已用完，明天再来"; case "JOB_IN_PROGRESS": "还有歌曲正在生成，请稍后重试"; case "APPLE_LOGIN_FAILED": "Apple 登录失败，请重新授权"; default: "请求失败（\(code)）" } }
}