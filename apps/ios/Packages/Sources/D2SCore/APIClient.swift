import Foundation
import D2SContract
public actor APIClient {
 public let baseURL: URL
 private let session: URLSession
 private let store: any SessionStore
 private var auth: AuthResult?
 private var refreshTask: Task<AuthResult, Error>?
 public init(baseURL: URL, session: URLSession = .shared, store: any SessionStore = AuthStore(), initialAuth: AuthResult? = nil) {
  self.baseURL = baseURL; self.session = session; self.store = store; self.auth = initialAuth ?? (try? store.read())
 }
 public func currentUser() -> Me? { auth?.user }
 public func setAuth(_ value: AuthResult) throws { try store.write(value); auth = value }
 public func logout() async throws { let _: EmptyResponse = try await request("auth/logout", method: "POST"); try store.clear(); auth = nil }
 public func clearAuth() throws { try store.clear(); auth = nil }
 public func request<T: Decodable & Sendable>(_ path: String, method: String = "GET", body: Data? = nil, authenticated: Bool = true) async throws -> T {
  let response = try await send(path, method: method, body: body, authenticated: authenticated)
  if response.1.statusCode == 401 && authenticated && auth != nil {
   try await refresh()
   let retry = try await send(path, method: method, body: body, authenticated: authenticated)
   return try decode(retry)
  }
  return try decode(response)
 }
 private func send(_ path: String, method: String, body: Data?, authenticated: Bool) async throws -> (Data, HTTPURLResponse) {
  var request = URLRequest(url: baseURL.appendingPathComponent(path)); request.httpMethod = method; request.httpBody = body; request.timeoutInterval = 30
  if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
  if authenticated, let auth { request.setValue("Bearer \(auth.accessToken)", forHTTPHeaderField: "Authorization") }
  let (data, response) = try await session.data(for: request)
  guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }; return (data, http)
 }
 private func decode<T: Decodable>(_ response: (Data, HTTPURLResponse)) throws -> T {
  guard (200..<300).contains(response.1.statusCode) else {
   let json = (try? JSONSerialization.jsonObject(with: response.0)) as? [String: Any]
   let code = (json?["error"] as? [String: Any])?["code"] as? String ?? json?["error"] as? String ?? "HTTP_\(response.1.statusCode)"
   throw APIError(status: response.1.statusCode, code: code, body: response.0)
  }
  if response.1.statusCode == 204, let empty = EmptyResponse() as? T { return empty }
  return try JSONDecoder().decode(T.self, from: response.0)
 }
 private func refresh() async throws {
  if let task = refreshTask { _ = try await task.value; return }
  guard let token = auth?.refreshToken else { throw URLError(.userAuthenticationRequired) }
  let task = Task<AuthResult, Error> {
   let response = try await self.send("auth/refresh", method: "POST", body: try JSONEncoder().encode(["refreshToken": token]), authenticated: false)
   return try self.decode(response)
  }
  refreshTask = task
  do { let value = try await task.value; try setAuth(value); refreshTask = nil }
  catch { refreshTask = nil; if let failure = error as? APIError, failure.status == 401 { try? clearAuth() }; throw error }
 }
 public func upload(file: URL, seconds: Double) async throws -> Recording {
  struct Input: Encodable { let mimeType = "audio/mp4"; var byteSize: Int; var durationSeconds: Double }
  let data = try Data(contentsOf: file)
  let ticket: UploadTicket = try await request("recordings/upload-url", method: "POST", body: try JSONEncoder().encode(Input(byteSize: data.count, durationSeconds: seconds)))
  var put = URLRequest(url: ticket.putUrl); put.httpMethod = "PUT"; put.allHTTPHeaderFields = ticket.headers
  let (_, response) = try await session.upload(for: put, from: data)
  guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { throw URLError(.cannotWriteToFile) }
  return try await request("recordings/\(ticket.recordingId)/complete", method: "POST")
 }
 public func eventRequest(jobID: String) -> URLRequest {
  var value = URLRequest(url: baseURL.appendingPathComponent("jobs/\(jobID)/events")); value.setValue("Bearer \(auth?.accessToken ?? "")", forHTTPHeaderField: "Authorization"); return value
 }
}
public struct SSEClient: Sendable {
 public init() {}
 public func events(request: URLRequest) -> AsyncThrowingStream<Job, Error> {
  AsyncThrowingStream { continuation in
   let task = Task {
    do {
     let (bytes, response) = try await URLSession.shared.bytes(for: request)
     guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { throw URLError(.badServerResponse) }
     var data = ""
     for try await line in bytes.lines {
      try Task.checkCancellation()
      if line.isEmpty { if let event = data.data(using: .utf8), let job = try? JSONDecoder().decode(Job.self, from: event) { continuation.yield(job) }; data = "" }
      else if line.hasPrefix("data:") { data += String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces) }
     }
     continuation.finish()
    } catch { continuation.finish(throwing: error) }
   }
   continuation.onTermination = { _ in task.cancel() }
  }
 }
}
