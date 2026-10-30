import SwiftUI
public enum Theme {
 public static let background = Color(hex: D2STokens.colorBg0)
 public static let accent = Color(hex: D2STokens.colorAccentPrimary)
 public static let card = Color.white.opacity(0.06)
}
extension Color {
 public init(hex: String) { let value = UInt64(hex.dropFirst(), radix: 16) ?? 0; self.init(red: Double((value >> 16) & 255)/255, green: Double((value >> 8) & 255)/255, blue: Double(value & 255)/255) }
}
public struct PrimaryButton: View {
 let title: String; let busy: Bool; let action: () -> Void
 public init(_ title: String, busy: Bool = false, action: @escaping () -> Void) { self.title = title; self.busy = busy; self.action = action }
 public var body: some View { Button(action: action) { HStack { if busy { ProgressView() }; Text(title).bold() }.frame(maxWidth: .infinity).frame(minHeight: 50) }.buttonStyle(.borderedProminent).tint(Theme.accent).disabled(busy) }
}
public struct Card<Content: View>: View {
 let content: Content
 public init(@ViewBuilder content: () -> Content) { self.content = content() }
 public var body: some View { content.padding(16).frame(maxWidth: .infinity, alignment: .leading).background(Theme.card, in: RoundedRectangle(cornerRadius: 16)) }
}
public struct Waveform: View {
 let level: Float
 public init(level: Float) { self.level = level }
 public var body: some View { HStack(spacing: 5) { ForEach(0..<25) { index in Capsule().fill(Theme.accent).frame(width: 4, height: CGFloat(10 + max(0, level) * Float(20 + index % 8 * 10))) } }.frame(height: 110).animation(.linear(duration: 0.1), value: level).accessibilityLabel("录音电平") }
}
