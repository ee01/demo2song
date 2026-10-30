使用 Swift 6 / iOS 17+。工程由 project.yml 生成，不提交 xcodeproj。
先运行 yarn harness codegen，再 xcodegen generate --spec apps/ios/project.yml。
业务网络使用 D2SCore；凭证只存 Keychain；fixture 代码仅 DEBUG。
真机配置写 Config/Local.xcconfig（不入库），不得提交密钥或个人签名资料。
