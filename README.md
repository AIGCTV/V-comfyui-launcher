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

**A ComfyUI launcher built for creators**: one-click startup, visual version management, RunningHub workflow conversion, model sharing, and Photoshop workflow support for ComfyUI portable packages.

## Highlights

### 1. RunningHub workflow conversion

- Convert supported RunningHub image apps into local ComfyUI-compatible workflow JSON.
- Track cloud task status and account balance from the launcher.
- Use generated workflows in Photoshop-oriented ComfyUI workflows.

### 2. Visual Git version management

- Browse Stable and Dev branch histories from the UI.
- Switch ComfyUI versions without typing Git commands.
- Use a GitHub mirror/proxy option when network access is slow.

### 3. Portable environment management

- Use bundled Python/Git by default.
- Override Python or Git paths when you need a custom local environment.
- Switch CPU/GPU launch modes from the dashboard.

### 4. Model sharing

- Create model-directory symlinks for multiple ComfyUI portable packages.
- Reduce duplicated model downloads and disk usage.

## Installation

### 1. Git runtime

The launcher uses Git for version management and updates. Install or unpack a Windows Git runtime before running version-management features.

Suggested sources:

- [Git for Windows releases](https://github.com/git-for-windows/git/releases)
- [Google Drive mirror](https://drive.google.com/file/d/12kELPaEiuC0DkMsCf3wOiDMp4_2UywR8/view?usp=sharing)
- [Quark mirror](https://pan.quark.cn/s/fc25d5b7ec59)

### 2. Directory layout

```text
ComfyUI_windows_portable/
├── git/                  # Git runtime
├── ComfyUI/              # ComfyUI source directory
├── python_embedded/      # Portable Python environment
├── launcher/             # Launcher source/resources for ZIP builds
└── AIGCTV_Launcher.exe   # Single-file launcher build
```

### 3. Quick start

1. Organize your directories as shown above.
2. Run `AIGCTV_Launcher.exe`.
3. After environment detection is complete, select **GPU** or **CPU** and start ComfyUI.

## Documentation

[![ComfyUI V-Launcher Tutorial](docs/images/banner2.webp)](https://www.youtube.com/watch?v=OL3lZimy85s)

See the detailed manual: [V ComfyUI Launcher User Manual](docs/UserGuide.md)

The manual covers:

1. Dashboard: basic operation and directory shortcuts.
2. Console: logs and dependency installation.
3. Versions: ComfyUI update and rollback.
4. PS Plugins: Photoshop workflow integration.
5. Settings: model sharing and advanced configuration.
6. Themes: dark and light mode.

## Build and Development

```bash
# Install dependencies
npm install

# Start development environment
npm run electron:dev

# Build source bundle
npm run build

# Build portable release
npm run electron:build:portable
```

Release binaries or ZIP packages should be published with the corresponding source code for the exact release tag or commit.

## Modification Notice

This project contains modifications by AIGCTV.

Modified date: 2026-06-01

Major changes:

- Added RunningHub workflow integration.
- Added visual Git version management.
- Added model sharing and symlink management.
- Added Photoshop workflow support.
- Added public-source packaging hygiene and security documentation.

## Third-Party Plugin Notice

`launcher-config.json` links to `https://github.com/AIGCTV/comfyui-photoshop-fix`, which is related to the upstream `NimaNzrii/comfyui-photoshop` project. That plugin is not licensed by this repository. If a release bundles that plugin or a modified copy of it, confirm and follow the plugin's own license and any required author permissions first.

## License

This project is licensed under the GNU General Public License v3.0 only (`GPL-3.0-only`).

See [LICENSE](./LICENSE) for details.
