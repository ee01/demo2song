import Foundation
import Security
public protocol SessionStore: Sendable { func read() throws -> AuthResult?; func write(_ value: AuthResult) throws; func clear() throws }
public struct AuthStore: SessionStore {
 private let service: String
 public init(service: String = "me.eexx.suiheng.auth") { self.service = service }
 public func read() throws -> AuthResult? {
  var query = base; query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne
  var result: CFTypeRef?; let status = SecItemCopyMatching(query as CFDictionary, &result)
  if status == errSecItemNotFound { return nil }
  guard status == errSecSuccess, let data = result as? Data else { throw StoreError.keychain(status) }
  return try JSONDecoder().decode(AuthResult.self, from: data)
 }
 public func write(_ value: AuthResult) throws {
  let data = try JSONEncoder().encode(value)
  let attributes: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
  let status = SecItemUpdate(base as CFDictionary, attributes as CFDictionary)
  if status == errSecItemNotFound { let inserted = SecItemAdd(base.merging(attributes) { _, new in new } as CFDictionary, nil); guard inserted == errSecSuccess else { throw StoreError.keychain(inserted) } }
  else if status != errSecSuccess { throw StoreError.keychain(status) }
 }
 public func clear() throws { let status = SecItemDelete(base as CFDictionary); guard status == errSecSuccess || status == errSecItemNotFound else { throw StoreError.keychain(status) } }
 private var base: [String: Any] { [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "session"] }
 enum StoreError: Error { case keychain(OSStatus) }
}
