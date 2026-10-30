import ActivityKit
struct GenerationAttributes: ActivityAttributes {
 struct ContentState: Codable, Hashable { var status: String; var title: String; var songId: String? }
 var jobID: String
}
