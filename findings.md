# 发现
- 当前分支 agent/sol/c806b418c38c 已快进集成 origin/feat/m1-foundation@4c69536；用户目录 ~/git/demo2song 保持不变。
- 已实现 M1、T2.1–T2.3；iOS 工程尚不存在。
- Xcode 16.4 / Swift 6.1.2 / iOS 18.5 SDK 可用，先前无 simulator runtime。

- 安装阻碍：registry.yarnpkg.com 被本机解析到 127.0.0.1；npmjs.org 可达，锁文件仅统一下载源不改版本。Xcode runtime 下载 Apple 目录返回 bad URL；磁盘剩余约16GiB。XcodeGen 已安装。
- Xcode -scheme generic destination 判定 iOS 未安装；使用 -target + 明确 SDK 与独立 SYMROOT/OBJROOT 可构建。使用默认包 build 目录会撞 Yams 的 build 文件；使用 OpenAPI build plugin 会在旧 Xcode 的 target 构建中误以 iOS 编译 host tool，改为 harness 调用 Swift 官方 CLI 并提交生成物。
- 官方 WeChat OpenSDK 2.0.9 来源腾讯 dldir1.qq.com；SPM binaryTarget 固定 SHA256。不是第三方重新打包。
- Asset Catalog 编译器即使设备构建也要求本机有 simulator runtime，因此当前设备测试包使用同源独立 PNG 图标，保留 AppIcon asset 供 runtime 安装后恢复上架打包。
- 本机 Apple Development 证书存在；已配对 iPhone 15 Pro 当前 unavailable。尚未选择用户确认的 Bundle ID/Team/微信开放平台配置，不自动注册新应用标识。
- HTTP E2E 发现 JSON Content-Type + 无 body 的 POST 会被 Fastify 拒绝，APIClient 已修复。测试存储路由改 wildcard 以支持长度超过100字符的对象 key。
- 手机随后连接：iPhone 15 Pro，系统报告27.2，开发者模式已启用，DDI服务false。既有通配profile覆盖此UDID且有效，但不支持主App的Apple/Push/Associated Domains，不能用它伪报完整签名。
- 新建隔离硬件测试产物 me.eexx.suiheng.hardwaretest，自动内存fixture+真实录放音，使用已有profile离线签名，codesign深度严格校验通过。首次devicectl安装失败根因是手机锁定（kAMDMobileImageMounterDeviceLocked），已请求用户解锁，不绕过锁屏。

- GitHub首次push被拒：OAuth App没有 workflow scope。将CI内容移至tools/harness/ci/multi-client.yml作为可启用模板，不假称CI已运行，不扩大凭据权限。
