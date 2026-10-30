import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents
struct RecordIntent: AppIntent {
 static let title: LocalizedStringResource = "用随哼录一段"
 static let openAppWhenRun = true
 func perform() async throws -> some IntentResult { .result() }
}
struct Entry: TimelineEntry { let date: Date }
struct Provider: TimelineProvider {
 func placeholder(in context: Context) -> Entry { Entry(date: .now) }
 func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) { completion(Entry(date: .now)) }
 func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) { completion(Timeline(entries: [Entry(date: .now)], policy: .never)) }
}
struct RecordWidget: Widget {
 let kind = "record"
 var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: Provider()) { _ in
  Link(destination: URL(string: "suiheng://record")!) { Label("哼一段", systemImage: "mic.fill").font(.headline) }.containerBackground(.purple.gradient, for: .widget)
 }.configurationDisplayName("随哼录音").description("打开随哼，记录灵感").supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular]) }
}
struct GenerationWidget: Widget {
 var body: some WidgetConfiguration {
  ActivityConfiguration(for: GenerationAttributes.self) { context in
   VStack(alignment: .leading) { Text("随哼 · \(context.state.title)").bold(); Text(context.state.status == "succeeded" ? "歌曲已完成，点击试听" : "AI 正在编曲，可稍后回来") }.padding().activityBackgroundTint(.black).activitySystemActionForegroundColor(.white)
    .widgetURL(URL(string: "suiheng://song/p/\(context.state.songId ?? "")"))
  } dynamicIsland: { context in
   DynamicIsland { DynamicIslandExpandedRegion(.center) { Text(context.state.title) }; DynamicIslandExpandedRegion(.bottom) { Text(context.state.status == "succeeded" ? "完成，点击试听" : "创作中") } } compactLeading: { Image(systemName: "waveform") } compactTrailing: { Image(systemName: context.state.status == "succeeded" ? "checkmark" : "music.note") } minimal: { Image(systemName: "waveform") }
    .widgetURL(URL(string: "suiheng://song/p/\(context.state.songId ?? "")"))
  }
 }
}
@available(iOSApplicationExtension 18.0, *)
struct ControlRecordIntent: AppIntent {
 static let title: LocalizedStringResource = "用随哼录一段"
 static let openAppWhenRun = true
 func perform() async throws -> some IntentResult & OpensIntent { .result(opensIntent: OpenURLIntent(URL(string: "suiheng://record")!)) }
}
@available(iOSApplicationExtension 18.0, *)
struct RecordControl: ControlWidget {
 var body: some ControlWidgetConfiguration { StaticControlConfiguration(kind: "me.eexx.suiheng.record") { ControlWidgetButton(action: ControlRecordIntent()) { Label("哼一段", systemImage: "mic.fill") } }.displayName("随哼录音") }
}
@main struct SuihengWidgetBundle: WidgetBundle {
 var body: some Widget { RecordWidget(); GenerationWidget(); if #available(iOSApplicationExtension 18.0, *) { RecordControl() } }
}
