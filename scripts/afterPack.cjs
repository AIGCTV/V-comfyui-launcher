const path = require('path');
const { execFileSync } = require('child_process');
const fs = require('fs');

exports.default = async function (context) {
    // All electron-builder entry points must audit the actual ASAR and unpacked files.
    const { scanDirectory, assertClean } = require('./security-audit.cjs');
    assertClean(scanDirectory(context.appOutDir));
    if (context.electronPlatformName !== 'win32') return;

    const exePath = path.join(context.appOutDir, 'VLauncher.exe');
    const rceditPath = path.join(__dirname, '../node_modules/rcedit/bin/rcedit.exe');
    const iconPath = path.join(__dirname, '../public/icon.ico');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    const version = pkg.version + '.0';

    // A release must fail if its icon or Windows version metadata cannot be set.
    execFileSync(rceditPath, [exePath,
        '--set-version-string', 'FileDescription', 'AIGCTV Launcher',
        '--set-version-string', 'ProductName', 'AIGCTV Launcher',
        '--set-version-string', 'CompanyName', 'AIGCTV',
        '--set-version-string', 'LegalCopyright', 'Copyright © 2026 AIGCTV',
        '--set-version-string', 'OriginalFilename', '',
        '--set-file-version', version,
        '--set-product-version', version,
        '--set-icon', iconPath
    ], { windowsHide: true, stdio: 'inherit' });
    console.log('[AfterPack] Icon and Windows version metadata set to ' + version);
};
