# V ComfyUI Launcher

[English](README.md) | [中文](README_CN.md)

<p align="center">
  <img src="https://img.shields.io/github/v/release/AIGCTV/V-comfyui-launcher?color=orange&label=release" />
  <img src="https://img.shields.io/github/downloads/AIGCTV/V-comfyui-launcher/total?color=blue&label=downloads" />
  <img src="https://img.shields.io/github/license/AIGCTV/V-comfyui-launcher" />
  <img src="https://img.shields.io/github/stars/AIGCTV/V-comfyui-launcher?style=social" />
</p>

**A ComfyUI Launcher that Understands Creators Better** — Designed to improve efficiency, simplify deployment, and enhance workflow management.

![Dashboard Preview](docs/images/banner.png)

## 🌟 Highlights

### 1. ⚡ Exclusive RunningHub Integration
Breaking the barrier between cloud and local workflows.
*   **One-Click Conversion**: Convert RunningHub cloud AI apps into local PS plugins with a single ID input.
*   **Automated Configuration**: Automatically parses node dependencies, enabling seamless transition between cloud rendering and local refinement when used with PS plugins.

### 2. 🔄 Visual Git Version Management
Say goodbye to complex command lines and take control of every update detail.
*   **Freedom of Movement**: Switch freely between Stable and Dev branches.
*   **Time Machine**: Full commit history list. Click "Switch" to rollback to any historical version instantly—no more worries about new version crashes.
*   **Network Acceleration**: Built-in GitHub proxy toggle to solve code fetching failures caused by network issues.

### 3. 🛡️ Clean Environment & Multi-Mode
*   **Environment Isolation**: Independent Python/Git virtual environments that do not interfere with the system, ensuring purity.
*   **Dual-Core Driver**: One-click switch between **CPU/GPU** modes, finding the right way to run whether you have a high-end graphics card or a thin-and-light laptop.
*   **Model Sharing**: Unique symbolic link mapping feature allows multiple ComfyUI instances to share a single large model library, saving valuable disk space.

---

## 📥 Installation

### 1. Prerequisites: Git Environment
This launcher relies on Git for version control and updates. If you haven't installed it or are using a streamlined system, please make sure to download and install the **Git Runtime** first.

**Download Channels:**
*   🚀 **[GitHub (Recommended)](https://github.com/git-for-windows/git/releases)**
*   ☁️ **[Google Drive](https://drive.google.com/file/d/12kELPaEiuC0DkMsCf3wOiDMp4_2UywR8/view?usp=sharing)**
*   📁 **[Quark Pan (China Speed)](https://pan.quark.cn/s/fc25d5b7ec59)**

### 2. Directory Structure Guide
To ensure the launcher correctly identifies your environment, please organize your files as follows:

```text
ComfyUI_windows_portable/ (Root)
├── git/                  <-- [Manual Create] Place extracted Git files here
├── ComfyUI/              <-- ComfyUI source directory
├── python_embedded/      <-- Portable Python environment
├── launcher/             <-- [ZIP Version] Contains source/resources
└── AIGCTV_Launcher.exe   <-- [Single File] Run directly from root
```

> [!TIP]
> **Where to put Git?** Download the portable version of Git and extract its contents into a folder named `git` within your root directory.

### 3. Quick Start
1.  Organize your directories as shown above.
2.  Double-click `AIGCTV_Launcher.exe` to run.
3.  The system will automatically detect the environment. Once ready, click **GPU** in the bottom right to start.

---

## 📖 Documentation

We provide specific operating manuals for each feature page, please refer to:

👉 **[Click to View "V ComfyUI Launcher User Manual"](docs/UserGuide.md)**

The manual covers detailed content including:
1.  **Dashboard**: Basic operation and directory management.
2.  **Console**: Log viewing and dependency installation.
3.  **Versions**: Kernel update and rollback tutorials.
4.  **PS Plugins**: Connection to Photoshop workflow.
5.  **Settings**: Model sharing and advanced parameter configuration.
6.  **Themes**：Switch between dark and light display modes.

---

## 🛠️ Build & Development

```bash
# Install dependencies
npm install

# Start development environment
npm run electron:dev

# Build portable release
npm run electron:build:portable
```

## 📄 License
MIT License
