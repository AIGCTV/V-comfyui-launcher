'use strict';

// Build both Windows distributions in new directories; retain all previous builds.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const { scanSource, scanHistory, scanDirectory, assertClean } = require('./security-audit.cjs');
assertClean(scanSource());
assertClean(scanHistory());
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { git, sourceSnapshot, assertNewVersion } = require('./release-policy.cjs');
assertNewVersion(pkg.version, git(['tag', '--list']).trim().split('\n'));
const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date()).replaceAll('-', '');
const run = `release-${pkg.version}-${date}-${Date.now()}`;
const staging = path.join(root, '.cache', run);
const frontend = path.join(staging, 'frontend');
const output = path.join(root, 'dist-electron', run);
if (fs.existsSync(staging) || fs.existsSync(output)) throw new Error('Release directory already exists');
fs.mkdirSync(staging, { recursive: true });

function node(script, args = []) {
    execFileSync(process.execPath, [path.join(root, script), ...args], {
        cwd: root, stdio: 'inherit', windowsHide: true
    });
}

const config = {
    ...pkg.build,
    directories: { ...pkg.build.directories, output },
    files: [
        { from: frontend, to: 'dist', filter: ['**/*', '!**/*副本*'] },
        'package.json', 'electron/**/*', 'public/**/*', 'node_modules/**/*', 'build-info.json',
        '!public/*副本*', '!node_modules/**/README*', '!node_modules/**/test/**',
        '!node_modules/**/*.map', '!node_modules/when/scripts/**'
    ],
    extraFiles: [
        ...(pkg.build.extraFiles || []),
        { from: 'LICENSE', to: 'LICENSE' },
        { from: 'NOTICE.md', to: 'NOTICE.md' }
    ],
    portable: {
        ...pkg.build.portable,
        artifactName: `V_comfyui_launcher_${pkg.version}_windows_x64_${date}.exe`
    }
};
const configFile = path.join(staging, 'electron-builder.json');
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(staging, 'release-manifest.json'), JSON.stringify({
    version: pkg.version, date, timezone: 'Asia/Taipei', platform: 'windows', arch: 'x64',
    allowed: ['dist/', 'electron/', 'public/', 'production node_modules/', 'package.json', 'build-info.json'],
    extraFiles: config.extraFiles,
    excluded: ['.env*', 'launcher-settings.json', 'rh-config.json', '.git', '.cache',
        'scripts', 'test fixtures', 'logs', 'ComfyUI', 'models', 'user data'],
    emptyData: 'No user settings, credentials, installed PS nodes or ComfyUI data are bundled.',
    runtimeConfig: 'launcher-settings.json is initialized at runtime in the launcher directory.',
    signing: 'Unsigned, as configured in package.json; publish SHA-256 checksums.',
    exe: config.portable.artifactName,
    zip: `V_comfyui_launcher_portable_${pkg.version}_windows_x64_${date}.zip`
}, null, 2) + '\n', 'utf8');

node('generate-build-info.cjs');
const builtSourceSnapshot = sourceSnapshot();
node('node_modules/typescript/bin/tsc');
node('node_modules/vite/bin/vite.js', ['build', '--outDir', frontend, '--emptyOutDir', 'false']);
assertClean(scanDirectory(frontend));
node('node_modules/electron-builder/cli.js', ['--win', 'portable', 'dir', '--x64',
    '--publish', 'never', '--config', configFile]);

const zip = path.join(output, `V_comfyui_launcher_portable_${pkg.version}_windows_x64_${date}.zip`);
// These are explicit, newly generated paths; no cleanup or deletion is performed.
const psQuote = value => "'" + value.replaceAll("'", "''") + "'";
execFileSync('powershell.exe', ['-NoProfile', '-Command',
    `Compress-Archive -Path ${psQuote(path.join(output, 'win-unpacked', '*'))} -DestinationPath ${psQuote(zip)}`
], { cwd: root, stdio: 'inherit', windowsHide: true });
fs.copyFileSync(path.join(staging, 'release-manifest.json'), path.join(output, 'release-manifest.json'));
const finalManifest = JSON.parse(fs.readFileSync(path.join(output, 'release-manifest.json'), 'utf8'));
if (sourceSnapshot() !== builtSourceSnapshot) throw new Error('Source changed during build; do not publish these artifacts');
finalManifest.sourceSnapshot = builtSourceSnapshot;
fs.writeFileSync(path.join(output, 'release-manifest.json'), JSON.stringify(finalManifest, null, 2) + '\n', 'utf8');
require('./verify-release.cjs').verifyRelease(output);
console.log('RELEASE_OUTPUT=' + output);
