# E-135 真机测试准备
目标：依据 docs/architecture/multi-client-plan.md 补齐剩余功能，使 iOS 可以构建并进入真机验收。用户已授权功能开发、提交与推送。不得把 fixture 通过当作真实服务通过。

## 阶段
1. [complete] 读取文档、接入基础分支、建立外部配置清单。
2. [complete] M2主链路代码与单测：小程序token、Apple、绑定/合并、注销/清理；外部验收另列。
3. [partial] M3原型11屏、fixture10组、CLI与金图/交互测试；真实端采集、全状态锚点和视觉评审未完成，未伪报。
4. [complete] M4代码与本地HTTP E2E：上传、SSE、通知适配、列表、分享H5、音频标记；云端验收待配置。
5. [complete] M5主流程实现、官方微信SDK、AVAudioEngine/AAC、Widget/Control/Live Activity；设备/模拟器编译，核心单测通过，真机和XCUITest未运行。
6. [in_progress] 最终回归、配置/验收手册、提交/PR；等待用户连接手机及确认非敏感标识。

## 边界
- X1–X6 是外部账号/域名/资质，不代替用户开通；等待 async 配置回复同时继续独立实现。
- T2.9 要求小程序发版满两周，不提前关闭生产兼容。
- TestFlight 一周、上架与真实硬件验收不伪报完成。
- 单任务分支规范采用当前 issue 的隔离分支，功能按阶段提交，避免改变其它本机 checkout。

## 错误记录
- yarn 安装：yarnpkg 域名 ECONNREFUSED，改锁文件下载域名 npmjs。
- simulator 下载：Apple MobileAsset catalog bad URL，改指定 18.5 版本再尝试。
