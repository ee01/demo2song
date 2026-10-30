# 进度
- 2026-10-30：恢复 issue 上下文，读取完整架构计划；接入已有账号基础；建立剩余阶段追踪。已向用户询问非敏感外部标识，不阻塞代码实现。
- M2：新增 Apple 验签/授权码交换/加密 refresh token、绑定冲突与显式合并、注销撤销接口；小程序 token storage/refresh 单飞与一次重试。
- M4：新增预签名 PUT/HEAD 完成校验，未完成上传不能生成；歌曲列表改为 songs+jobs 批量查询。
- M4：SSE、设备注册、订阅、APNs/Live Activity notifier、30天注销清理和 ID3 AIGC 标记已实现，待相应验证。
- M3：11 screen / 10 fixtures 的单文件原型已生成；正在实现 harness。
- M5：XcodeGen 工程、SPM 模块与主要页面、录放音、扩展已建立，编译进行中。
- 验证：新增 HTTP E2E 完成真实HTTP登录、m4a直传、HEAD确认、worker转码、ID3标记、播放、公开分享、曲库、refresh，provider与对象存储为内存mock，无付费调用。
- 验证：Swift 6个核心测试通过；iOS主App+Widget+官方微信SDK未签名device build通过。原型交互验收与金图已生成。
- 限制：模拟器 runtime 下载两种版本均报 MobileAsset bad URL；官方目录手动读取403。不能运行XCUITest或产生真实iOS截图，未声称视觉对齐通过。
- 文档同步：架构计划新增逐项实现/待验收表；真机手册提供离线硬件和真实服务两条路径。未把未完成的全量视觉对齐、微信H5开放标签、P95基准或外部资质标记为完成。
- 已尝试实机路径：读取现有证书/profile与设备匹配，隔离离线硬件包完成签名校验；安装遇到设备锁屏，等待用户解锁。当前未运行真机录音/播放验收。

- 交付：LFS金图对象已上传；首次Git push因workflow scope被拒，CI改交付模板后重推。手机仍报告passcodeRequired=true。

- 最终交付：PR #2 已创建，代码及LFS推送成功；本机项目 ios/device-testing 分支已同步并生成Xcode工程。53个TS测试+2个Harness测试、6个Swift核心测试、Debug/Release设备与Debug模拟器编译、HTTP E2E通过。设备安装仅因锁屏阻塞，未运行真机业务或UI验收。

- 用户回复“解锁了”后恢复装机：读取 passcodeRequired=false；devicectl安装 me.eexx.suiheng.hardwaretest 成功，启动成功；随后查询主App和Widget扩展进程仍在运行。已解除锁屏安装阻塞，可进入人工硬件测试；未代替用户确认麦克风/录放音行为。
