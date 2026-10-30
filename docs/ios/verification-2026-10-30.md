# 真机准备验证记录 · 2026-10-30

代码 PR：https://github.com/ee01/demo2song/pull/2 。基础来自 `feat/m1-foundation@4c69536`，新增实现提交 `014acfa`。本机项目已同步到 `ios/device-testing`，XcodeGen 工程已生成，工作区干净。

| 验证 | 实际结果 |
|---|---|
| `yarn config:validate` | 通过 |
| `yarn typecheck`（包含 HTTP smoke 脚本） | 通过 |
| `yarn test` | 53 个 TS 单测、2 个 Harness 测试通过 |
| `yarn build:all` | 小程序、API、worker、共享包和 web-share 构建通过 |
| `yarn workspace @demo2song/contract lint` | OpenAPI 校验通过 |
| `swift test --package-path apps/ios/Packages` | 6 个核心测试通过（运行于 macOS，不是 iOS UI 测试） |
| `xcodebuild ... -target Suiheng -configuration Debug -sdk iphoneos ... build` | 主 App、Widget/Live Activity 扩展、官方微信 SDK 编译通过，未签名标准包 |
| 同上，Release / iphoneos | 通过 |
| 同上，Debug / iphonesimulator | 通过；不代表模拟器已启动 |
| `tsx scripts/ios-smoke.mts` | 真实 HTTP + m4a 直传、HEAD、worker 转码、SSE 终态在3秒内送达、AI 标签、试听、分享、曲库、refresh 通过；存储和生成服务为内存 mock，无付费调用 |
| `harness acceptance --feature ios-foundation` | 原型交互测试通过 |
| `harness golden` | 11 screen / 48 state / 2 device 共96张截图已生成；图片通过 Git LFS 交付 |
| `harness codegen` 重跑 | 与提交产物无差异 |
| 生产 fixture 剔除检查 | 小程序产物、iOS Release 二进制未包含 fixture 凭证标记 |
| 离线硬件包签名 | 使用本机已有且覆盖手机的描述文件，独立 Bundle ID，`codesign --verify --deep --strict` 通过 |
| 真机安装 | 首次尝试因手机锁屏失败（kAMDMobileImageMounterDeviceLocked）；随后读取仍为 passcodeRequired=true，未重复安装 |

手机已连接并配对、开发者模式启用；系统报告 iOS 27.2。本机 Xcode 16.4，模拟器 runtime 下载失败。当前没有实际运行 XCUITest、手机录放音、真实微信/Apple/APNs、Universal Link 或两端视觉对齐；`specs/parity.yaml` 保持 unverified。

离线包“随哼硬件测试”自动使用独立内存 fixture 会话，允许先做真实麦克风/电平/草稿/试听/锁屏控制测试，不含真实账号。完整业务签名需要支持 Apple/Push/Associated Domains 的应用配置与描述文件，真实云端需另行配置凭据和域名。

CI 未启用：当前 GitHub OAuth 缺少 workflow scope，首次推送被拒；CI 改以 `tools/harness/ci/multi-client.yml` 模板交付后推送成功。不存在“CI已通过”的结论。

当前继续条件：手机解锁并保持屏幕常亮后重试安装；如 DDI 仍报兼容性错误，再升级到支持设备系统的 Xcode。不要向评论发送手机密码或服务端私钥。
