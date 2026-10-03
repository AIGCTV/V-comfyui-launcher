# 安全打包与发布流程

旧 Key 的 GitHub 处置由仓库所有者完成；本次后续工作只规范流程，不发布新版本。应用版本保持 1.2.0。

## 第一道防线：上传前检查

新克隆执行 `npm run security:install-hooks`。Git 不会自动给新克隆安装本地 hooks。

- 提交前：扫描实际暂存区，不能通过只清空工作文件绕过扫描。
- 推送前：扫描源码和全部可达 Git 历史；发现私有配置或凭据即退出。
- 不输出匹配到的秘密，只报告文件、规则和行号。
- 支持 CJS、TSX、JSON、环境变量赋值和大文件；空 `.env.example` 仅作为源码模板，不进入运行包。

GitHub Security 工作流和原生 secret scanning/push protection 是补充防线。上传后的检查不能阻止秘密首次公开；不要跳过本地 hooks。GitHub 推送保护不能保证识别所有供应商或任意格式的 API Key。

## 下一次真正发布时

1. 拉取已清理的最新代码和 tags；在新克隆安装 hooks。
2. 更新 package.json 和 package-lock.json 的版本，必须高于已有版本；新增 `docs/Release_<版本>.md`。
3. 运行 `npm run test:security`、项目相关测试和 `npm run security:check`、`npm run security:history`。
4. 运行 `npm run release:build`。旧的 electron:build 命令统一转到这一个流程。
5. 检查本地程序启动与需要验证的业务功能。提交对应源码和 build-info.json，创建版本 tag，推送；pre-push 再次检查。
6. 执行 `npm run release:publish -- <本次发布目录>`。

## 自动构建关卡

源码及历史扫描 → 生成版本信息并记录源码摘要 → TypeScript 检查 → 生产前端构建及扫描 → electron-builder 的 beforePack/afterPack 审计 → 图标和版本元数据 → ZIP → 解包最终 EXE/ZIP → 检查 ASAR 和解包文件 → SHA-256。

任何一步失败都中止。构建期间或构建后源码变化，发布校验会要求重新构建。源码摘要不包含本地绝对路径。所有产物使用独立目录，不自动删除旧目录。

`.env`、真实用户设置、RunningHub 配置、私钥、日志、缓存、测试数据和源码映射都不能进入运行包。对 Electron 依赖中的源码也执行内容检查，不能仅按压缩包的文件名判断安全。

## 自动发布关卡

`release:publish` 要求工作区干净，重新运行本地源码、历史和成品扫描，核对源码摘要、包版本、当前提交、本地 tag 和远端 tag。禁止覆盖已有 Release 或降级发布。

通过后从已扫描的 tag 生成源码 ZIP，只上传指定的 EXE、解压 ZIP、源码 ZIP、SHA-256 文件。先创建草稿，逐个核对 GitHub 返回的大小和 SHA-256；全部一致后才正式发布。不上传整个目录、审计缓存或历史备份。

失败时保留草稿和文件，需要人工查看后处理；脚本不自动删除或覆盖已发布附件。尚未通过检查的包不能手动上传绕过流程。

## 验证与限制

安全测试覆盖真实暂存区与历史扫描、32 位 Key 检出、扫描结果脱敏、大文件、私有配置、空模板和版本规则。发布脚本进行语法和策略测试；按照本次要求，不为验证脚本而创建新的 GitHub Release。

静态规则不能证明绝对安全，图片中显示的凭据、特殊编码的秘密和新增供应商格式仍需人工审查。发现真实泄露后应立即撤销凭据；重写历史不能收回已经被复制的数据。依赖升级、Electron 内核升级和签名证书维护需在独立发布前验证。
