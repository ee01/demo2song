// swift-tools-version: 6.0
import PackageDescription
let package = Package(name: "WechatSDK", platforms: [.iOS(.v12)], products: [.library(name: "WechatOpenSDK", targets: ["WechatOpenSDK"])], targets: [
 .binaryTarget(name: "WechatOpenSDK", url: "https://dldir1.qq.com/WechatWebDev/opensdk/XCFramework/OpenSDK2.0.9.zip", checksum: "ebbdd935f840bedabe1c39ad6149356b37764645ff939ce0160a438520545697")
])
