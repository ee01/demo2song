// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "D2S", platforms: [.iOS(.v17), .macOS(.v14)],
 products: ["D2SCore", "D2SDesign", "D2SStrings", "D2SFlows", "D2SAudio", "D2SFeatures"].map { .library(name: $0, targets: [$0]) },
 dependencies: [
  .package(url: "https://github.com/apple/swift-openapi-generator", exact: "1.10.2"),
  .package(url: "https://github.com/apple/swift-openapi-runtime", exact: "1.8.3"),
  .package(url: "https://github.com/apple/swift-openapi-urlsession", exact: "1.0.2")
 ], targets: [
  .target(name: "D2SContract", dependencies: [.product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"), .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession")], exclude: ["openapi.yaml", "openapi-generator-config.yaml"]),
  .target(name: "D2SCore", dependencies: ["D2SContract"]),
  .target(name: "D2SDesign"),
  .target(name: "D2SStrings", resources: [.process("Resources")]),
  .target(name: "D2SFlows"),
  .target(name: "D2SAudio"),
  .target(name: "D2SFeatures", dependencies: ["D2SCore", "D2SDesign", "D2SStrings", "D2SFlows", "D2SAudio"]),
  .testTarget(name: "D2SCoreTests", dependencies: ["D2SCore", "D2SFlows"])
 ])
