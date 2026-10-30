| 意图 | iOS | 小程序 |
|---|---|---|
| hold-to-record | AVAudioRecorder，拖拽上滑锁定，AAC m4a | Taro RecorderManager，松开结束 |
| play | AVPlayer + NowPlaying + RemoteCommand | InnerAudioContext |
| share | ShareLink H5 + 微信小程序卡片 | onShareAppMessage |
| notify-when-done | APNs / Live Activity | 微信订阅消息 |
| save-file | 系统分享导出 | 微信文件保存 |
| login | 微信 OpenSDK / AuthenticationServices | Taro.login + wechat-mp |

原型 data-ui 是锚点唯一来源，iOS accessibilityIdentifier / 小程序 data-ui 与之对应。fixture 编译开关只用于 Debug/开发，不连接真实账号。
