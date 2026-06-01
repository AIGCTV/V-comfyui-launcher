const path = require('path');
const { execSync } = require('child_process');
const fs = require('fs');

exports.default = async function (context) {
    if (context.electronPlatformName !== 'win32') return;

    const appOutDir = context.appOutDir;
    const appName = "VLauncher.exe"; // 对应 package.json 里的 executableName
    const exePath = path.join(appOutDir, appName);

    console.log(`[AfterPack] Processing: ${exePath}`);

    // 自动寻找 rcedit，先找项目内，再找构建工具内
    let rceditPath = path.join(__dirname, '../node_modules/rcedit/bin/rcedit.exe');
    if (!fs.existsSync(rceditPath)) {
        console.warn("[AfterPack] 警告：未在默认路径找到 rcedit，尝试跳过或请安装 npm install rcedit --save-dev");
        return;
    }

    const iconPath = path.join(__dirname, '../public/icon.ico');

    try {
        // 加上 --set-version-string "OriginalFilename" "" 清除原始文件名
        const cmd = `"${rceditPath}" "${exePath}" --set-version-string "FileDescription" "AIGCTV Launcher" --set-version-string "ProductName" "AIGCTV Launcher" --set-version-string "LegalCopyright" "Copyright © 2026 AIGCTV" --set-version-string "OriginalFilename" "" --set-icon "${iconPath}"`;
        execSync(cmd);
        console.log('[AfterPack] ✅ 元数据修改成功！');
    } catch (error) {
        console.error('[AfterPack] ❌ 修改失败，但继续构建:', error.message);
    }
};
