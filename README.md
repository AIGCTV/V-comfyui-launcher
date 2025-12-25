<div align="center">

# 🚀 AIGCTV ComfyUI Launcher

**专为 ComfyUI 便携版打造的现代化桌面启动器**

[![GitHub release](https://img.shields.io/github/v/release/AIGCTV/AIGCTV-comfyui-launcher?style=flat-square)](https://github.com/AIGCTV/AIGCTV-comfyui-launcher/releases)
[![GitHub stars](https://img.shields.io/github/stars/AIGCTV/AIGCTV-comfyui-launcher?style=flat-square)](https://github.com/AIGCTV/AIGCTV-comfyui-launcher/stargazers)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE.txt)

[📦 下载最新版](https://github.com/AIGCTV/AIGCTV-comfyui-launcher/releases) | [📖 使用教程](https://fcnindgiaxi4.feishu.cn/wiki/UcqtwbJzeiX5dbkiNGBcoClInlg) | [💬 问题反馈](https://github.com/AIGCTV/AIGCTV-comfyui-launcher/issues)

</div>

---

## ✨ 功能特性

### 🎯 一键启动
- **GPU / CPU 模式切换** - 根据显卡情况灵活选择运行模式
- **实时状态监控** - 清晰显示运行状态（已停止 / 启动中 / 运行中）
- **版本信息展示** - 同时显示启动器版本和 ComfyUI 版本

### 📁 便捷目录管理
- **快速打开常用目录**：根目录、输入图片、输出图片、工作流文件夹
- **一键直达**，无需手动寻找路径

### 🔄 版本管理
- **Git 版本控制** - 支持从 GitHub 获取最新 ComfyUI 版本
- **稳定版 / 开发版** 切换 - 可选择使用稳定版或最新开发版
- **GitHub 代理支持** - 国内用户可开启代理加速下载

### ☁️ RunningHub 云端集成
- **API 密钥管理** - 安全保存 RunningHub API 配置
- **账户信息查看** - 实时显示账户余额、积分、任务数
- **任务状态监控** - 自动检测并轮询任务进度
- **工作流生成** - 一键从 RunningHub 获取并生成本地工作流

### ⚙️ 高级设置
- **Python 环境配置** - 支持便携版 Python 或自定义路径
- **Git 路径配置** - 支持便携版 Git 或自定义路径
- **自定义启动参数** - 添加额外的 ComfyUI 启动参数
- **模型目录软链接** - 共享多个 ComfyUI 实例的模型目录

### 💻 终端工具
- **内置终端** - 打开预配置环境的命令行
- **环境隔离** - 自动配置便携版 Python 和 Git 环境变量
- **实时日志** - 查看 ComfyUI 运行日志和错误信息

### 🎨 界面特性
- **深色 / 浅色主题** - 一键切换，护眼模式
- **远程公告系统** - 接收最新公告和更新通知
- **动态 Banner** - 支持远程更新首页横幅图片
- **现代化 UI** - 使用 React + Tailwind CSS 打造

---

## 📦 安装与使用

### 系统要求
- **操作系统**: Windows 10 / 11 (64位)
- **ComfyUI**: 需要 ComfyUI 便携版 (Portable)

### 下载安装

1. 前往 [Releases 页面](https://github.com/AIGCTV/AIGCTV-comfyui-launcher/releases) 下载最新版本
2. 解压到你的 ComfyUI 便携版根目录（与 `ComfyUI` 文件夹同级）
3. 双击运行 `AIGCTV-ComfyUI-Launcher.exe`

### 目录结构

```
ComfyUI_windows_portable/
├── ComfyUI/                    # ComfyUI 主程序
├── python_embeded/             # 便携版 Python
├── git/                        # 便携版 Git (可选)
├── AIGCTV-ComfyUI-Launcher.exe # 启动器程序
└── launcher/                   # 启动器源码 (开发用)
```

---

## 🛠️ 开发指南

### 环境准备

确保已安装 [Node.js](https://nodejs.org/) (推荐 LTS 版本)

### 安装依赖

```bash
cd launcher
npm install
```

### 开发模式

```bash
# 启动 Vite 开发服务器 (仅 UI 预览)
npm run dev

# 启动 Electron 开发模式 (完整功能)
npm run electron:dev
```

### 构建打包

```bash
# 构建生产版本
npm run electron:build
```

打包后的可执行文件位于 `dist-electron/` 目录。

---

## 📋 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript |
| **构建工具** | Vite |
| **桌面框架** | Electron |
| **UI 样式** | Tailwind CSS |
| **图标库** | Lucide React |
| **打包工具** | Electron Builder |

---

## 🔧 配置文件说明

### launcher-config.json

远程配置文件，用于动态更新启动器首页：

```json
{
  "banner": "https://example.com/banner.png",
  "announcement": {
    "title": "欢迎使用 AIGCTV 启动器",
    "time": "2025-12-25"
  }
}
```

### rh-config.json

RunningHub API 配置文件（本地保存）：

```json
{
  "apiKey": "your-api-key",
  "webappId": "your-webapp-id"
}
```

---

## 📚 相关资源

- 📦 [ComfyUI 整合包](https://fcnindgiaxi4.feishu.cn/wiki/UcqtwbJzeiX5dbkiNGBcoClInlg)
- 📚 [知识库](https://fcnindgiaxi4.feishu.cn/wiki/S50Hwm8qBiFM2YkTmhPcTwSnn2d)
- 🗃️ [模型库](https://pan.quark.cn/s/cc750e23e454)
- 🔧 [PS-AI 插件代码](https://github.com/AIGCTV/comfyui-photoshop-fix)

---

## 📺 关注我们

<div align="center">

| 平台 | 链接 |
|:----:|:----:|
| YouTube | [@AIGC_TV](https://www.youtube.com/@AIGC_TV) |
| Bilibili | [AIGCTV](https://space.bilibili.com/3546670109296710) |
| 抖音 | [AIGCTV](https://v.douyin.com/oxJOXC5R5EI) |
| 小红书 | [AIGCTV](https://xiaohongshu.com/user/profile/6629cdd10000000003030bc5) |
| 知识星球 | [AIGCTV](https://wx.zsxq.com/group/88888418288522) |

</div>

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE.txt) 开源协议。

---

<div align="center">

**Made with ❤️ by AIGCTV**

如果觉得这个项目对你有帮助，欢迎给个 ⭐ Star！

</div>
