// generate-build-info.cjs - 在构建时生成版本和时间信息
const fs = require('fs');
const path = require('path');

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));

// Generate build info
const buildInfo = {
    version: packageJson.version,
    buildDate: new Date().toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-'),
    buildTimestamp: Date.now()
};

// Write to build-info.json
fs.writeFileSync(
    path.join(__dirname, 'build-info.json'),
    JSON.stringify(buildInfo, null, 2)
);

console.log('✅ Build info generated:', buildInfo);
