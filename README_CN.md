# AIGCTV ComfyUI Launcher

[English](README.md) | [中文](README_CN.md)

**更懂创作者的 ComfyUI 启动器** — 专为提升效率、简化部署与增强工作流管理而生。

![Dashboard Preview](docs/images/banner.png)

## 🌟 核心亮点 (Highlights)

### 1. ⚡ 独家 RunningHub 工作流并轨
打破云端与本地的壁垒。
*   **一键转换**: 输入 ID 即可将 RunningHub 云端AI应用一键转换为本地PS插件。
*   **自动化配置**: 自动解析节点依赖，配合 PS 插件实现云端渲染与本地精修的无缝衔接。

### 2. 🔄 可视化 Git 版本管理
告别复杂的命令行，把控每一个更新细节。
*   **自由穿梭**: 支持在 Stable (稳定版) 与 Dev (开发版) 分支间随意切换。
*   **时光机**: 完整的提交历史列表，点击“切换”即可回退到任意历史版本，不再担心新版崩溃。
*   **国内加速**: 内置 GitHub 代理开关，解决网络环境导致的代码拉取失败问题。

### 3. 🛡️ 纯净环境与多模态
*   **环境隔离**: 独立的 Python/Git 虚拟环境，互不干扰，确保系统纯净。
*   **双核驱动**: 一键切换 **CPU/GPU** 模式，无论是高端显卡还是轻薄本都能找到合适的运行方式。
*   **模型共享**: 独有的软链接映射功能，支持多个 ComfyUI 实例共享同一份大模型库，节省宝贵的硬盘空间。

---

## 📥 安装与准备 (Installation)

### 必要前置: Git 环境
本启动器依赖 Git 进行版本控制与更新。如果您尚未安装或使用的是精简版系统，请务必先下载安装 Git 运行库。

🔗 **[Git 运行库下载链接](PREPARED_GIT_LINK_HERE)**  
*(请点击上方链接下载并安装，安装后重启启动器即可)*

### 快速开始
1.  下载并解压本启动器压缩包。
2.  双击运行 `ComfyUI Launcher.exe`。
3.  系统会自动检测环境，准备就绪后点击右下角 **GPU** 启动即可。

---

## 📖 使用文档 (Documentation)

我们为每个功能页面提供了详细的操作手册，请参阅：

👉 **[点击查看《ComfyUI Launcher 使用手册》](docs/UserGuide_CN.md)**

手册包含以下详细内容：
1.  **启动 (Dashboard)**: 基础运行与目录管理。
2.  **控制台 (Console)**: 日志查看与依赖安装。
3.  **版本 (Versions)**: 内核更新与回退教程。
4.  **PS插件 (PS Plugins)**: 对接 Photoshop 工作流。
5.  **设置 (Settings)**: 模型共享与高级参数配置。

---

## 🛠️ 构建与开发

```bash
# 安装依赖
npm install

# 启动开发环境
npm run electron:dev

# 打包发布
npm run electron:build:portable
```

## 📄 License
MIT License

