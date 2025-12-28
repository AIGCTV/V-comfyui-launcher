# AIGCTV ComfyUI Launcher

[English](README.md) | [中文](README_CN.md)

**A ComfyUI Launcher that Understands Creators Better** — Designed to improve efficiency, simplify deployment, and enhance workflow management.

![Dashboard Preview](docs/images/dashboard-preview.png)

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

### Prerequisites: Git Environment
This launcher relies on Git for version control and updates. If you haven't installed it or are using a streamlined system, please make sure to download and install the Git runtime library first.

🔗 **[Git Runtime Download Link](PREPARED_GIT_LINK_HERE)**  
*(Please click the link above to download and install, then restart the launcher)*

### Quick Start
1.  Download and extract the launcher package.
2.  Double-click `ComfyUI Launcher.exe` to run.
3.  The system will automatically detect the environment. Once ready, click **GPU** in the bottom right start.

---

## 📖 Documentation

We provide specific operating manuals for each feature page, please refer to:

👉 **[Click to View "ComfyUI Launcher User Manual"](docs/UserGuide.md)**

The manual covers detailed content including:
1.  **Dashboard**: Basic operation and directory management.
2.  **Console**: Log viewing and dependency installation.
3.  **Versions**: Kernel update and rollback tutorials.
4.  **PS Plugins**: Connection to Photoshop workflow.
5.  **Settings**: Model sharing and advanced parameter configuration.

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
