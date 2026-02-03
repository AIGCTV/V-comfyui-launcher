---
description: 打包启动器（单文件exe + unpacked zip），自动修复图标和版本信息
---

# 打包启动器

> **新特性**：现在集成了 `afterPack` 钩子，打包过程中会自动修复图标和版本元数据。

## 前置准备

1. 确保 `package.json` 中的版本号已更新
2. 确保 `App.tsx` 中的 `launcherVersion` 已更新

## 打包步骤

用户只需说：**"打包 v1.0.x"**（替换 x 为版本号）

// turbo-all

### 1. 清理旧的构建缓存
```powershell
Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue
```

### 2. 执行一键构建 (推荐)
```powershell
npx electron-builder --win
```
此命令会同时：
1. 构建前端
2. 构建 Unpacked 版 -> **自动触发 Hook 修复元数据**
3. 构建 Portable 版 (基于已修复的文件)

### 3. (可选) 分步构建
如果一键构建失败，可以分步执行：

**Step A: 构建 Unpacked 版本**
```powershell
npm run electron:build:dir
```
(构建完成后 `dist-electron/win-unpacked/VLauncher.exe` 已经是修复好的状态)

**Step B: 构建 Portable 版本**
```powershell
npm run electron:build:portable
```

### 4. 刷新 Windows 图标缓存
```powershell
ie4uinit.exe -show
```

### 5. 打包 ZIP
将自动生成的Unpacked目录打包为ZIP：
```powershell
Compress-Archive -Path "dist-electron\win-unpacked\*" -DestinationPath "dist-electron\V_comfyui_launcher_portable_1.0.63.zip" -Force
```
（将版本号替换为实际版本）

## 输出文件

打包完成后，在 `dist-electron` 目录下会有：
- `V_comfyui_launcher_1.0.63.exe` - 单文件便携版 (75MB+)
- `V_comfyui_launcher_portable_1.0.63.zip` - 解压版

## 验证清单

- [ ] Portable EXE：双击运行，检查任务管理器进程名是否为 **VLauncher**
- [ ] Portable EXE：文件属性 -> 详细信息，应包含 "AIGCTV" 等版权信息
- [ ] ZIP 包：解压后检查 VLauncher.exe 的版本信息

## 故障排除

如果构建过程中 Hook 报错：
1. 确保 `npm install` 已正确安装所有依赖（特别是 `rcedit`）
2. 检查 `public/icon.ico` 是否存在
3. 手动测试 `fix-version-info.cjs` 脚本看看是否独立运行正常