import Foundation
public enum Copy { public static func text(_ key: String) -> String { String(localized: String.LocalizationValue(key), bundle: .module) } }
