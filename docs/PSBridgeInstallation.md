# PS Bridge 节点安装与更新 / Node installation

## 使用

在设置页找到 **PS 节点安装与更新**。启动器自动识别当前便携包，安装位置为：

```text
ComfyUI/custom_nodes/comfyui-ps-bridge-nodes
```

1. 关闭 ComfyUI，点击“重新检查”。
2. 点击“安装节点”；已由启动器安装过的节点显示“更新节点”。
3. 等待下载、依赖安装和六节点导入验证完成。
4. 重启 ComfyUI，浏览器按 Ctrl+F5 刷新。

安装来源固定为 [公开仓库 main](https://github.com/AIGCTV/comfyui-ps-bridge-nodes)。每次先解析提交号，再下载该提交的源码 ZIP。版本号相同而提交号不同，仍会更新。此功能不依赖 GitHub Release 或本地 Git。

节点版本与 VLauncher 版本独立编号。这里只管理 ComfyUI 节点；使用 Photoshop 时需自行准备兼容的 Vplugins。`psPluginPath` 旧配置保留但不再参与安装。

## 环境和网络

- 使用设置页指定的 Python；留空则使用便携包的 `python_embeded/python.exe`。
- 要求 Python 3.10 以上，实际检查 ComfyUI V3 API，并在安装依赖后导入六个节点验证。
- 不自动升级 ComfyUI。文档中验证过的 ComfyUI 版本不作为硬编码的最低版本。
- 下载源码沿用 GitHub 镜像设置；查询最新提交仍访问 GitHub API。依赖安装沿用 PyPI 镜像设置。
- 错误详情保留在设置页，完整子进程输出写入启动器控制台。
- 节点导入验证不等于已验证 Photoshop / Vplugins 全链路。

## 旧安装和用户数据

- 仅检查目标 `comfyui-ps-bridge-nodes` 目录；未安装时提示安装。旧 Photoshop 节点可以保留，不阻止安装、不提示移除。
- 同名目录没有有效的启动器安装记录时，不覆盖外部安装。
- 已管理的源码被修改或删除时，不覆盖用户修改。请手动保存修改后处理该目录，再执行全新安装。
- 正常更新保留用户新增文件、运行数据及空目录。与新源码发生路径冲突时停止。
- 安装记录 `.vlauncher-install.json` 保存来源、提交、版本、时间和源码 SHA-256 清单；这是后续更新的文件保护依据。

## 暂存、备份和失败恢复

暂存目录位于便携包根目录下的 `.vlauncher-ps-bridge`，在 `custom_nodes` 之外。每次操作使用独立目录，旧版本保存在该操作目录的 `backup` 中；不会自动清理。

在目录切换之前失败，现有节点目录保持原状。切换失败会尝试恢复旧目录。依赖安装发生在共享 Python 环境，节点文件回退不自动回退 Python 包。

若出现 `RECOVERY_REQUIRED`：

1. 关闭所有启动器和 ComfyUI 实例。
2. 查看 `.vlauncher-ps-bridge/pending.json` 中的目标、暂存及备份路径。
3. 保留目标目录中的现有文件；如需恢复，将目标目录手动移到安全位置，再将记录中的备份移回目标位置。
4. 确认目标完整后，手动处理 `pending.json`。安装锁存在且程序已退出时，可核对后单独移除 `install.lock`。
5. 重新启动启动器并检查。

启动器不递归删除目录。确认备份和暂存不再需要后，由用户手动清理。

## 验证命令

```text
npm run test:ps-bridge
npx tsc --noEmit
node --check electron/main.cjs
node --check electron/ps-bridge-service.cjs
```

测试在 `.cache/ps-bridge-tests` 下使用独立目录和本地 HTTP 模拟服务，不操作真实节点，不自动清理测试目录。覆盖首次安装、相同提交、同版本新提交、数据保留、冲突、旧节点、进程互斥、失败恢复、网络错误和 ZIP 路径校验。

打包时 `electron/ps-bridge-probe.py` 必须通过 `asarUnpack` 放到 `app.asar.unpacked`，因为外部 Python 无法读取 Electron 的 ASAR 虚拟路径。

可选的实际验收脚本：

- `scripts/verify-ps-bridge-ui.cjs`：用 Electron 运行，参数为前端构建目录。使用真实界面和 preload、模拟安装结果，保存中英文截图及 ASAR 探测结果。若宿主设置了 `ELECTRON_RUN_AS_NODE`，需从测试子进程环境中移除此变量。
- `scripts/verify-ps-bridge-live.cjs`：用 Node 运行。指定 `PS_BRIDGE_TEST_COMFY_ROOT`（现有 ComfyUI Git 目录）和 `PS_BRIDGE_TEST_PYTHON`。脚本复制核心源码到隔离目录、下载公开节点，依赖使用 `pip --target`，验证上传和无模型 PNG 输出，不修改现有环境。
- 验证文档基线时，将 `PS_BRIDGE_TEST_CORE_COMMIT` 设为 `12d5279438bfefc058a269eae805ceab6047777f`。脚本下载 ComfyUI 0.34.0 及其前端 1.49.6 所需的部分测试依赖；已有的 torch 等基础依赖仍由指定 Python 提供。

这些实际验收会保留 `.cache` 下的截图、日志和报告，不自动删除测试目录。生产构建也可指定新的输出目录并使用 `--emptyOutDir false`，避免清空已有构建文件。

## English quick guide

Open **Settings → PS node installation and updates**. Stop ComfyUI, check the detected directory, and click **Install nodes** or **Update nodes**. Restart ComfyUI and hard-refresh the browser afterwards.

The installer follows the public repository's `main` branch and pins each download to a commit. It uses the configured ComfyUI Python, GitHub download mirror and PyPI mirror. It does not install Photoshop or Vplugins, or migrate legacy nodes.

Old Photoshop nodes do not block installation. An unmanaged installation at the target path, modified source and conflicting user files require manual handling. Staging files and backups remain under `.vlauncher-ps-bridge`, outside `custom_nodes`. Review `pending.json` if a directory switch was interrupted. Node rollback does not roll back shared Python dependencies. No directory is recursively deleted.
