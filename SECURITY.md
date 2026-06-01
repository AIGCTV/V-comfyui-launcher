# Security Policy / 安全策略

## Supported Versions / 支持版本

Security fixes are handled on the latest `main` branch and the latest public release.

安全修复会优先应用到最新的 `main` 分支和最新公开发布版本。

## Reporting a Vulnerability / 报告漏洞

Please do not open a public issue for vulnerabilities, leaked credentials, or exploitable behavior.

请不要用公开 Issue 报告漏洞、泄露凭据或可被利用的问题。

Report privately with:

- A clear description of the issue.
- Affected version or commit.
- Reproduction steps or proof of concept.
- Impact and any suggested mitigation.

私下报告时请包含：

- 问题描述。
- 受影响版本或提交。
- 复现步骤或验证方式。
- 影响范围和建议修复方式。

## Sensitive Data / 敏感信息

Never commit API keys, RunningHub credentials, local filesystem paths, private config, build logs, packaged binaries, or dependency folders. Use the example files in this repository as templates and keep real values in ignored local files.

请勿提交 API Key、RunningHub 凭据、本地文件路径、私有配置、构建日志、打包二进制或依赖目录。请使用仓库中的示例文件作为模板，并把真实值保存在已忽略的本地文件中。

## Secure Defaults / 安全默认值

The launcher stores local user settings in `launcher-settings.json` and RunningHub settings in `rh-config.json`. Both files are ignored by Git. Public remote launcher content belongs in `launcher-config.json`.

启动器会把本地用户设置保存在 `launcher-settings.json`，把 RunningHub 设置保存在 `rh-config.json`。这两个文件都被 Git 忽略。公开远程启动器内容应放在 `launcher-config.json`。
