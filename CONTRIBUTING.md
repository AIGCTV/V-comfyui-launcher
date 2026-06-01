# Contributing / 贡献指南

## Development Setup / 开发环境

Install dependencies and run the app from the launcher directory:

```powershell
npm install
npm run electron:dev
```

在启动器目录安装依赖并运行开发环境：

```powershell
npm install
npm run electron:dev
```

## Build Checks / 构建检查

Run the source build before submitting changes:

```powershell
npm run build
```

提交前请运行源码构建检查：

```powershell
npm run build
```

Use Electron packaging commands only when you need to produce a distributable:

```powershell
npm run electron:build
npm run electron:build:portable
```

只有需要生成分发包时才运行 Electron 打包命令。

## Repository Hygiene / 仓库清洁

Do not commit:

- `node_modules/`
- `dist/` or `dist-electron/`
- local config such as `.env.local`, `launcher-settings.json`, or `rh-config.json`
- build logs, caches, packaged Electron runtime files, or local working copies
- real API keys, tokens, passwords, or user-specific paths

请勿提交依赖目录、构建产物、本地配置、日志缓存、打包运行时文件、真实密钥或用户本地路径。

## Pull Requests / PR 规范

Keep changes focused. Include a short summary, validation commands, and screenshots for visible UI changes. Update templates or documentation when behavior changes.

请保持变更聚焦。PR 中请包含简短说明、验证命令；如果涉及界面变化，请附截图。行为变化时同步更新模板或文档。

## Configuration / 配置说明

Use `.env.example`, `launcher-settings.example.json`, and `rh-config.example.json` as templates. Copy values into ignored local files for development.

请使用 `.env.example`、`launcher-settings.example.json` 和 `rh-config.example.json` 作为模板，把真实值复制到已忽略的本地文件中用于开发。
