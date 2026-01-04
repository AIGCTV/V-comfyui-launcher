---
description: 打包启动器（单文件exe + unpacked zip），自动修复图标
---

# 打包启动器工作流

此工作流用于打包 ComfyUI 启动器，包含单文件 portable exe 和 unpacked zip 两个版本。

## 问题说明

**为什么图标会出错？**
1. `electron-builder` 的 `portable` 模式有时不能正确嵌入图标到 exe 文件中
2. Windows 有图标缓存机制，即使图标已更新，文件管理器可能仍显示旧图标
3. 需要用 `rcedit` 工具在打包后二次修复图标

## 打包步骤

用户只需说：**"打包 v1.0.x"**（替换 x 为版本号）

// turbo-all

### 1. 更新版本号
修改 `package.json` 中的 `version` 字段为指定版本号。

### 2. 清理缓存
```powershell
Remove-Item -Recurse -Force dist, dist-electron -ErrorAction SilentlyContinue
```

### 3. 打包 Portable 单文件 exe
```powershell
npm run electron:build:portable
```

### 4. 打包 Unpacked 目录
```powershell
npm run electron:build:dir
```

### 5. 修复 Unpacked exe 图标（关键步骤！）
```powershell
node -e "require('rcedit')(require('path').resolve('dist-electron/win-unpacked/AIGCTV启动器.exe'), { icon: require('path').resolve('public/icon.ico') }).then(() => console.log('Icon fixed!')).catch(e => console.error(e))"
```

### 6. 刷新 Windows 图标缓存
```powershell
ie4uinit.exe -show
```

### 7. 打包 Unpacked 为 zip
```powershell
Compress-Archive -Path "dist-electron\win-unpacked\*" -DestinationPath "dist-electron\V_comfyui_launcher_portable_VERSION.zip" -Force
```
（将 VERSION 替换为实际版本号）

## 输出文件

打包完成后，在 `dist-electron` 目录下会有：
- `V_comfyui_launcher_x.x.x.exe` - 单文件便携版
- `V_comfyui_launcher_portable_x.x.x.zip` - 解压版（包含所有运行时文件）

## 注意事项

1. **图标缓存问题**：如果在原目录看到错误图标，复制到其他位置查看，或重启 Explorer
2. **Portable exe 图标**：Portable exe 是自解压格式，其图标由 electron-builder 在打包时嵌入，通常不需要额外修复
3. **Unpacked exe 图标**：必须用 rcedit 修复，因为 electron-builder --dir 模式不会正确嵌入图标