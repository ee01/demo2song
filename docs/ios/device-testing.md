# iOS 真机测试

代码基于 `docs/architecture/multi-client-plan.md`，主 App、Widget、Live Activity 和官方微信 OpenSDK 已接入。生成代码由 `yarn harness codegen` 更新。设备/模拟器 SDK 编译成功不代表已经运行过真实手机或通过视觉对齐。

## 1. 本机准备

```sh
corepack yarn install --frozen-lockfile
corepack yarn harness codegen
xcodegen generate --spec apps/ios/project.yml
open apps/ios/Suiheng.xcodeproj
```

在 `apps/ios/Config/Local.xcconfig` 填已注册的标识（此文件不入库）：

```xcconfig
DEVELOPMENT_TEAM = YOUR_TEAM_ID
APP_BUNDLE_ID = YOUR_REGISTERED_BUNDLE_ID
API_BASE = https:/$()/YOUR_TEST_API_HOST/v1
SHARE_BASE = https:/$()/YOUR_SHARE_HOST
LINK_HOST = YOUR_SHARE_HOST
UNIVERSAL_LINK = https:/$()/YOUR_SHARE_HOST/wx/
WECHAT_OPEN_APP_ID = wxYOUR_IOS_APP_ID
WECHAT_MINIPROGRAM_ID = gh_YOUR_ORIGINAL_MINIPROGRAM_ID
```

`WECHAT_MINIPROGRAM_ID` 是小程序原始 ID（`gh_...`），不是用于后端登录的 `wx...` AppID。不要将服务器 secret 或 .p8 放入 App 配置。

连接 iPhone，解锁并信任电脑、开启开发者模式；在 Xcode 选择 Suiheng scheme 和手机。两个 target 的 Signing & Capabilities 使用相同 Team，Widget Bundle ID 是主 ID 加 `.widgets`。自动签名后运行。iOS 版本必须受所选 Xcode 支持。

当前电脑发现已有 Apple Development 证书，但尚未确认正式 Bundle ID/Team 与微信移动应用配置，未擅自注册新的 App ID。

## 2. 先做离线硬件检查

在 Debug scheme 的 Run → Arguments 添加：

```text
-harness -screen record -state idle -fixture user-new
```

这会使用独立的内存 fixture 会话，不覆盖真实 Keychain。先阅读声纹授权，检查麦克风权限、按住/上滑锁定/停止、6秒下限、60秒上限、实时电平、试听和锁屏播放。录音草稿保存在 App 沙盒，退出再打开应恢复。

此模式只用于页面/硬件测试，不能当作真实账号、云端上传或歌曲生成验证。真实流程测试前移除所有 harness 参数。

## 3. 真实服务前置

- 微信小程序与 iOS 移动应用绑定至同一微信开放平台主体，以取得同一个 unionid；先登录一次小程序，再在 iOS 登录核对作品。
- API/worker 部署本分支，并初始化 `identities`、`sessions`、`merge_logs` 集合。生产开启 `WECHAT_LOGIN_STRICT=true`，设置至少32字符的 `JWT_SECRET`。
- Apple：配置 `APPLE_BUNDLE_ID`、`APPLE_TEAM_ID`、`APPLE_KEY_ID`、`APPLE_PRIVATE_KEY`，以及独立的32字节 base64 `IDENTITY_ENCRYPTION_KEY`。通过服务端授权码交换保存加密 refresh token，以便注销时撤销授权。
- COS：沿用原存储凭据；预签名 PUT 有效10分钟，签入文件类型与长度，完成接口用 HEAD 校验。worker 环境需要 ffmpeg。
- APNs：配置 `APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_PRIVATE_KEY`、`APNS_BUNDLE_ID`、`APNS_ENV`。Debug 使用 sandbox；Release 使用 production，并配置相应签名 entitlement。
- 分享：构建 `apps/web-share` 时提供 `APPLE_TEAM_ID` 和 `APPLE_BUNDLE_ID`；部署 `dist`，将 `/p/*` 回退到 index.html，`/.well-known/apple-app-site-association` 以 application/json 无重定向提供。微信 Web 开放标签还需要公众号 JS-SDK 签名，当前页面采用小程序说明，不声称该开放标签已接通。
- 真实云端部署尚未执行：当前隔离工作区没有生产凭据，也未确认外部标识。`WECHAT_LOGIN_STRICT=false` 与内存后端仅用于本地验证，不能用于线上账号打通验收。

本地 API 若使用局域网地址，需要手机与 Mac 在同一网络。优先使用 HTTPS 测试域名；不要把 127.0.0.1 当作手机访问 Mac 的地址。App 不会自动放宽生产 ATS。

## 4. 真机验收顺序

1. 微信登录：同一个 userId，能看到小程序已有作品；取消登录可恢复；重复登录不产生新账号。
2. Apple 登录、绑定微信/Apple；冲突先展示作品数量，确认后合并；进行中任务拒绝合并；注销后会话失效，Apple 授权撤销。
3. m4a 上传和 Demo：正常、断网、token过期刷新、配额用尽、服务失败；生成期间可以返回曲库；SSE断线时轮询降级。
4. Demo试听、AI生成歌词与手改、完整版提交、曲库刷新、长歌词、空列表、音频导出与分享。
5. 前后台播放、锁屏播放/暂停/拖动、耳机与来电打断；确认 AAC 文件可被 worker 转码。
6. 点击“开启生成完成通知”，验证后台 APNs、Live Activity更新/结束、灵动岛点按、通知点按打开歌曲。
7. 锁屏/桌面 Widget、iOS18 Control、快捷指令打开录音；Universal Link 和微信分享卡片。

## 5. 自动验证

```sh
yarn config:validate
yarn typecheck
yarn test
yarn build:all
swift test --package-path apps/ios/Packages
node_modules/.bin/tsx scripts/ios-smoke.mts
yarn harness proto build
yarn harness acceptance --feature ios-foundation
yarn harness golden
```

`ios-smoke.mts` 是前台 HTTP E2E：真实m4a转码、上传完成校验、任务、SSE变化在3秒内送达、AI标签、播放、分享、列表、refresh；生成服务和对象存储被模拟，无付费请求。所有本地服务在测试结束后关闭。

当前电脑缺少 simulator runtime，Apple MobileAsset 下载报 bad URL，官方目录请求403；因此没有运行 `xcodebuild test` / XCUITest，也没有 iOS/小程序真实截图。`specs/parity.yaml` 如实标记 unverified，不能用原型 golden 替代端截图。

已验证的编译方式（绕过当前机器 generic destination 误判）：

```sh
xcodebuild -project apps/ios/Suiheng.xcodeproj -target Suiheng -configuration Debug -sdk iphoneos CODE_SIGNING_ALLOWED=NO SYMROOT="$PWD/.harness/ios-build/products" OBJROOT="$PWD/.harness/ios-build/objects" build
```

将 sdk 改为 iphonesimulator 可编译模拟器产物。执行测试仍需安装 runtime、启动模拟器，再运行 `yarn harness capture --platform ios`。

Asset Catalog 编译器也受当前 runtime 缺失影响；目前设备包使用同源 PNG 图标。安装 runtime 后可移除 project.yml 的 Assets.xcassets 排除、设置 ASSETCATALOG_COMPILER_APPICON_NAME=AppIcon，准备上架包。未完成 TestFlight、真实视觉对齐、隐私条款定稿或商店审核。

## 参考依据

- [Apple Sign in with Apple REST API](https://developer.apple.com/documentation/signinwithapplerestapi)
- [Apple：下载 Xcode 组件](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components)
- 微信 SDK 使用 [腾讯官方 OpenSDK 2.0.9 归档](https://dldir1.qq.com/WechatWebDev/opensdk/XCFramework/OpenSDK2.0.9.zip)，来源与校验和固定在 `apps/ios/WechatSDK/Package.swift`。

## 6. 已有通配描述文件的离线装机路径

本机已连接设备为 iPhone 15 Pro，系统报告 iOS 27.2；Xcode 16.4 的 DDI 服务尚未就绪。已有本地通配开发描述文件覆盖此手机，但不能签 Apple 登录/推送/Associated Domains 的完整包。

为先做麦克风、录音草稿和播放测试，可构建 Debug 产物后运行：

```sh
python3 scripts/ios-hardware-package.py --udid PHONE_UDID
xcrun devicectl device install app --device PHONE_UDID .harness/hardware-test/Suiheng.app
```

脚本只使用本机已存在且覆盖指定手机的开发证书/描述文件，不创建门户资源。产物使用独立 Bundle ID `me.eexx.suiheng.hardwaretest`，显示名“随哼硬件测试”，采用不含推送/Apple登录/Associated Domains的测试签名；Debug 内存 fixture 会话自动启用，顶部显示离线测试标识。此包不能验收真实登录、云端生成或推送，也不用于发布。

安装时手机必须解锁且信任电脑。此轮已签名并通过 `codesign --verify --deep --strict`。首次安装被设备锁屏阻止；用户解锁后安装与启动均成功，随后查询确认主 App 和 Widget 扩展进程在运行。现在可直接在手机打开“随哼硬件测试”。麦克风、录放音与锁屏行为仍需人工操作验收。
