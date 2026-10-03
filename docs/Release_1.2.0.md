# VLauncher 1.2.0 发布说明

发布日期：2026-10-03（Asia/Taipei）。

- 主页公告更新为“AIGCTV自研PS插件发布，官网ps.aigctv.net”，同时更新英文和离线默认公告。
- 启动器版本统一为 1.2.0；升级公告缓存，移除界面中旧版本的默认值。
- 设置页加入 PS Bridge 节点安装与更新，固定提交下载、环境探测、源码修改保护和失败恢复；详见 [PS Bridge 安装说明](PSBridgeInstallation.md)。
- 移除 RunningHub 页面及其接口；已有本地私有配置继续由 Git 忽略。
- 打包钩子设置图标、AIGCTV 元数据及 Windows 文件/产品版本；修复失败时停止发布构建。

## 打包规范

执行 `npm run release:build`。每次创建独立的前端构建和发布目录，保留旧产物，不清空目录。

发布目录位于 `dist-electron/release-1.2.0-20261003-<timestamp>/`，包含：

- `V_comfyui_launcher_1.2.0_windows_x64_20261003.exe`：单文件便携版。
- `V_comfyui_launcher_portable_1.2.0_windows_x64_20261003.zip`：解压版。
- `win-unpacked/`：与 ZIP 对应的应用目录。
- `release-manifest.json`：版本、构建日期、允许文件、排除内容、运行配置和签名状态。

打包内容为生产前端、Electron 应用代码、生产依赖、公开图片和构建版本信息。解压目录附带 GPL 许可证 `LICENSE`、`NOTICE.md` 以及 Electron/Chromium 许可证。`electron/ps-bridge-probe.py` 和 7-Zip 运行文件保持 ASAR 解包配置。

不打包私有 `.env`、用户设置、RunningHub 凭据、ComfyUI、模型、已安装的 PS 节点、测试脚本与测试数据、日志、缓存或 Git 元数据。应用首次启动时读取或生成用户自己的本地设置。PS 节点由用户在设置页主动下载安装。

保持项目现有未签名配置，发布 SHA-256 校验文件。生产前端关闭源码映射，并移除 console/debugger。

## 验证和发布

发布前运行 PS Bridge 测试、TypeScript 检查、生产界面检查、ASAR 文件清单及敏感内容审计，检查 EXE 图标和文件/产品版本。测试报告和截图保存在 `.cache`，不作为运行包发布。

审核通过后将源码提交到 `main`，创建对应的 `v1.2.0` tag，使用该 tag 生成完整源码 ZIP。GitHub Release 同时提供 EXE、解压版 ZIP、源码 ZIP 和 SHA-256 校验文件。

PS Bridge 安装和界面验证不代表已完成 Photoshop/Vplugins 全链路验证。

审计排除两项已核验的第三方运行库误报：`node-7z-archive/lib/createSfx.js` 中 `pwd` 是根据 `__dirname` 生成的路径变量；`whatwg-url/lib/url-state-machine.js` 中 `password` 从 `this.base` 复制 URL 字段。它们不含实际凭据；审计报告记录文件哈希。

本次验证结果：PS Bridge 自动测试 18/18 通过；TypeScript 和生产构建通过；中英文设置页及旧公告缓存升级通过；实际单文件 EXE 与解压版 EXE 在独立空设置目录启动通过；ASAR 和 ZIP 内容审计通过，ZIP CRC 及关键文件 SHA-256 一致。Windows 解压版文件和产品版本为 1.2.0.0，单文件便携版为 1.2.0。
