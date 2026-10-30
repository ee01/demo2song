// SwiftPM needs an authored source to activate this target's generator plugin.
import Foundation
import OpenAPIURLSession
public enum ContractClient {
 public static func make(serverURL: URL) -> Client { Client(serverURL: serverURL, transport: URLSessionTransport()) }
}
