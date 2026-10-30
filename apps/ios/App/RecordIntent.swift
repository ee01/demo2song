import AppIntents
struct RecordHummingIntent: AppIntent {
 static let title: LocalizedStringResource = "用随哼录一段"
 static let description = IntentDescription("打开随哼录音页面，记录一段旋律。录音需要你主动开始。")
 static let openAppWhenRun = true
 func perform() async throws -> some IntentResult { .result() }
}
struct SuihengShortcuts: AppShortcutsProvider {
 static var appShortcuts: [AppShortcut] { AppShortcut(intent: RecordHummingIntent(), phrases: ["用\(.applicationName)录一段"], shortTitle: "哼一段", systemImageName: "mic.fill") }
}
