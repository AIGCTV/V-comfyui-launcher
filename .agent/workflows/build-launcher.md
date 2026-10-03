---
description: 打包启动器（单文件 EXE + 解压版 ZIP），设置图标和 Windows 版本元数据，保留旧产物
---

# 打包启动器

## 前置准备

1. 确认发布版本，更新 package.json 和 package-lock.json。
2. 主页版本使用 generate-build-info.cjs 生成的 build-info.json。
3. 检查公告及离线默认配置；确认本次包含的项目改动。

## 构建

执行：

```powershell
chcp 65001
npm run release:build
```

脚本在 .cache 和 dist-electron 下创建独立的版本、日期、时间戳目录。不删除或清空旧文件；需要清理旧目录时由用户手动处理。

构建流程：生成 UTF-8 版本信息、TypeScript 检查、生产前端构建、Electron 打包、afterPack 修复图标和 Windows 版本信息、生成 ZIP。afterPack 失败时停止构建。

## 输出与核验

- V_comfyui_launcher_<version>_windows_x64_<YYYYMMDD>.exe：单文件便携版。
- V_comfyui_launcher_portable_<version>_windows_x64_<YYYYMMDD>.zip：解压版。
- win-unpacked/：与 ZIP 对应的应用目录。
- release-manifest.json：打包清单、排除内容和签名状态。

核验 EXE 启动、进程名称 VLauncher、图标、AIGCTV 版权、文件和产品版本、主页公告、PS Bridge preload 和解包的 Python 探测脚本。检查 ASAR 和最终 ZIP，禁止打包私有配置、凭据、用户数据、日志、缓存和测试数据。附带 GPL 和第三方许可证。

## GitHub 发布

审计通过后提交已确认的项目源码，推送到仓库，创建对应版本 tag；从该 tag 生成完整源码 ZIP。Release 提供 EXE、解压版 ZIP、对应源码 ZIP 和 SHA-256 校验文件。签名配置以项目 package.json 为准。

所有文本和 JSON 文件明确使用 UTF-8。具体版本的改动与验证见 docs/Release_<version>.md。
