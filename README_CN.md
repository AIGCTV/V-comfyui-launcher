# V ComfyUI Launcher

[English](README.md) | [中文](README_CN.md)

<p align="center">
  <img src="https://img.shields.io/github/v/release/AIGCTV/V-comfyui-launcher?color=orange&label=release" />
  <img src="https://img.shields.io/badge/platform-Windows-blue" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0--only-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="https://www.youtube.com/@aigc_tv" target="_blank"><img src="https://img.shields.io/badge/YouTube-AIGCTV-red?logo=youtube&logoColor=white" alt="YouTube"></a>
  <a href="https://space.bilibili.com/3546670109296710" target="_blank"><img src="https://img.shields.io/badge/Bilibili-AIGCTV-FF69B4?logo=bilibili&logoColor=white" alt="Bilibili"></a>
</p>

**面向创作者的 ComfyUI 启动器**：支持一键启动、可视化版本管理、RunningHub 工作流转换、模型共享，以及面向 Photoshop 工作流的 ComfyUI 辅助能力。

## 核心亮点

### 1. RunningHub 工作流转换

- 将支持的 RunningHub 图像应用转换为本地 ComfyUI 兼容的工作流 JSON。
- 在启动器中追踪云端任务状态和账户余额。
- 让生成的工作流服务于 Photoshop 相关的 ComfyUI 工作流。

### 2. 可视化 Git 版本管理

- 在界面中浏览 Stable 和 Dev 分支历史。
- 不需要手动输入 Git 命令即可切换 ComfyUI 版本。
- 网络较慢时可启用 GitHub 镜像/代理选项。

### 3. 便携环境管理

- 默认使用整合包内置 Python/Git。
- 支持指定本机 Python 或 Git 路径。
- 可在启动页切换 CPU/GPU 运行模式。

### 4. 模型共享

- 为多个 ComfyUI 整合包创建模型目录软链接。
- 减少重复下载和磁盘占用。

## 安装说明

### 1. Git 运行环境

启动器使用 Git 进行版本管理和更新。使用版本管理功能前，请先安装或解压 Windows Git 运行环境。

推荐下载：

- [Git for Windows releases](https://github.com/git-for-windows/git/releases)
- [Google Drive 镜像](https://drive.google.com/file/d/12kELPaEiuC0DkMsCf3wOiDMp4_2UywR8/view?usp=sharing)
- [夸克网盘镜像](https://pan.quark.cn/s/fc25d5b7ec59)

### 2. 目录结构

```text
ComfyUI_windows_portable/
├── git/                  # Git 运行环境
├── ComfyUI/              # ComfyUI 源码目录
├── python_embedded/      # 便携 Python 环境
├── launcher/             # ZIP 版本的启动器源码/资源
└── AIGCTV_Launcher.exe   # 单文件启动器版本
```

### 3. 快速开始

1. 按上方结构组织目录。
2. 运行 `AIGCTV_Launcher.exe`。
3. 等待环境检测完成后，选择 **GPU** 或 **CPU** 并启动 ComfyUI。

## 使用文档

[![ComfyUI V-Launcher Tutorial](docs/images/banner2.webp)](https://www.youtube.com/watch?v=OL3lZimy85s)

详细手册：[V ComfyUI Launcher 使用手册](docs/UserGuide_CN.md)

手册内容包括：

1. 启动：基础运行和快捷目录。
2. 控制台：日志查看和依赖安装。
3. 版本：ComfyUI 更新和回退。
4. PS 插件：Photoshop 工作流集成。
5. 设置：模型共享和高级配置。
6. 主题：深色和浅色模式。

## 构建与开发

```bash
# 安装依赖
npm install

# 启动开发环境
npm run electron:dev

# 构建源码产物
npm run build

# 构建便携发布包
npm run electron:build:portable
```

发布 EXE 或 ZIP 时，应同时提供该发布版本对应 tag 或 commit 的完整源码。

## 修改说明

本项目包含 AIGCTV 的修改内容。

修改日期：2026-06-01

主要修改：

- 增加 RunningHub 工作流集成功能。
- 增加可视化 Git 版本管理。
- 增加模型共享和软链接管理。
- 增加 Photoshop 工作流支持。
- 增加公开源码打包清理和安全文档。

## 第三方插件说明

`launcher-config.json` 中链接到 `https://github.com/AIGCTV/comfyui-photoshop-fix`，该插件与上游 `NimaNzrii/comfyui-photoshop` 项目相关。该插件不由本仓库授权。如果发布包中直接打包该插件或其修改版，请先确认并遵守插件自身许可证以及可能需要的原作者授权。

## License

本项目使用 GNU General Public License v3.0 only (`GPL-3.0-only`) 授权。

详情请见 [LICENSE](./LICENSE)。
