public enum GenerationState: String, Sendable, CaseIterable { case idle, uploading, queued, running, succeeded, failed }
public struct GenerationFlow: Sendable {
 public private(set) var state: GenerationState = .idle
 public init() {}
 public mutating func receive(_ event: GenerationState) {
  switch (state, event) {
  case (.idle, .uploading), (.idle, .queued), (.uploading, .queued), (.queued, .running), (.queued, .succeeded), (.running, .succeeded), (_, .failed), (.failed, .idle), (.succeeded, .idle): state = event
  default: break
  }
 }
}
