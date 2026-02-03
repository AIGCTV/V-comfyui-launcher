/**
 * fix-version-info.cjs
 * 用于修复 Electron 应用的 EXE 版本信息
 * 使用 rcedit 设置正确的 ProductName、FileDescription 等信息
 */

const rcedit = require('rcedit');
const path = require('path');
const fs = require('fs');
const pkg = require('./package.json');

async function fixVersionInfo(exePath, productName = 'VLauncher') {
    const resolvedPath = path.resolve(exePath);

    if (!fs.existsSync(resolvedPath)) {
        console.error('❌ 文件不存在:', resolvedPath);
        process.exit(1);
    }

    console.log('📝 正在修复版本信息:', resolvedPath);
    console.log('   ProductName:', productName);
    console.log('   Version:', pkg.version);

    try {
        await rcedit(resolvedPath, {
            'icon': path.resolve('public/icon.ico'),
            'version-string': {
                'ProductName': productName,
                'FileDescription': `${productName} - AIGCTV ComfyUI 启动器`,
                'CompanyName': 'AIGCTV',
                'LegalCopyright': 'Copyright © 2026 AIGCTV',
                'OriginalFilename': 'VLauncher.exe',
                'InternalName': 'VLauncher'
            },
            'file-version': `${pkg.version}.0`,
            'product-version': `${pkg.version}.0`
        });

        console.log('✅ 版本信息修复完成:', resolvedPath);
    } catch (error) {
        console.error('❌ 修复失败:', error.message);
        process.exit(1);
    }
}

// 从命令行参数获取要处理的文件
const targetPath = process.argv[2];
const customName = process.argv[3] || 'VLauncher';

if (targetPath) {
    fixVersionInfo(targetPath, customName).catch(console.error);
} else {
    console.log('用法: node fix-version-info.cjs <exe-path> [product-name]');
    console.log('示例: node fix-version-info.cjs "dist-electron/win-unpacked/VLauncher.exe"');
}
