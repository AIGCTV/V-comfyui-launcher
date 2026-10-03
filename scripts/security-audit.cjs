'use strict';

// Never print matching text: reports contain only paths, rules and line numbers.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const privateName = /^(?:rh-config\.json|launcher-settings\.json|\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\..*)?|service-account.*\.json)$|\.(?:pem|key|p12|pfx|log|bak|sqlite3?|db|dump)$/i;
const privateDir = /(?:^|\/)(?:\.git|\.cache|\.aws|\.ssh|fixtures|testdata|screenshots|recordings|backups)(?:\/|$)/i;
const rules = [
    ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
    ['provider-token', /\b(?:gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{30,}|AIza[A-Za-z0-9_-]{35}|AKIA[A-Z0-9]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9_-]{20,})\b/g],
    ['literal-secret', /["']?\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret|password|passwd)\b["']?\s*[:=]\s*["']([^"'\r\n]{12,})["']/gi],
    ['env-secret', /^\s*(?:export\s+)?[A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*([^\s#]{12,})/gm],
    ['url-secret', /[?&](?:api[_-]?key|access[_-]?token|token|secret|password)=[A-Za-z0-9_%+./=-]{12,}/gi],
    ['url-credentials', /https?:\/\/[^\s/:@]+:[^\s/@]{8,}@/g]
];

function scanFile(name, data, mode = 'source') {
    name = name.replaceAll('\\', '/');
    const findings = [];
    const base = path.posix.basename(name);
    const text = data.toString('utf8');
    const emptyEnvTemplate = base === '.env.example' && text.split(/\r?\n/).every(line => !line.trim() || /^\s*#/.test(line) || /^\s*[A-Z_][A-Z0-9_]*=\s*$/.test(line));
    if ((privateName.test(base) && !(mode === 'source' && emptyEnvTemplate)) || (mode !== 'source' && (privateDir.test(name) || /\.(?:map|zip|7z|tar|gz|test\.[cm]?js)$/i.test(name)))) {
        findings.push({ path: name, rule: 'private-or-development-file' });
    }
    for (const [rule, pattern] of rules) {
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
            // Placeholder values are explicit, never arbitrary paths or entire files.
            const value = match[1] || match[0];
            if (match[1] && /^(?:your[-_][a-z_-]+|replace_me|<[^>]+>|\$\{[^}]+\})$/i.test(value)) continue;
            findings.push({ path: name, rule, line: text.slice(0, match.index).split('\n').length });
        }
    }
    return findings;
}

function git(args, cwd = root, encoding = 'utf8', input) {
    return execFileSync('git', ['-c', 'core.fsmonitor=false', '-c', `safe.directory=${cwd.replaceAll('\\', '/')}`, ...args], { cwd, encoding, input, maxBuffer: 128 * 1024 * 1024, windowsHide: true });
}

function scanSource({ staged = false, cwd = root } = {}) {
    const args = staged ? ['ls-files', '-z'] : ['ls-files', '--cached', '--others', '--exclude-standard', '-z'];
    const files = [...new Set(git(args, cwd).split('\0').filter(Boolean))];
    return files.flatMap(name => {
        const data = staged ? git(['show', `:${name}`], cwd, null) : fs.readFileSync(path.join(cwd, name));
        return scanFile(name, data);
    });
}

function scanHistory(cwd = root) {
    const entries = git(['rev-list', '--objects', '--all'], cwd).trim().split('\n');
    const findings = [];
    const objects = [];
    for (const entry of entries) {
        const split = entry.indexOf(' ');
        if (split < 0) continue;
        const oid = entry.slice(0, split), name = entry.slice(split + 1);
        objects.push({ oid, name });
    }
    if (!objects.length) return findings;
    const batch = git(['cat-file', '--batch'], cwd, null, objects.map(item => item.oid).join('\n') + '\n');
    let offset = 0;
    for (const { oid, name } of objects) {
        const end = batch.indexOf(10, offset);
        const header = batch.subarray(offset, end).toString('utf8').split(' ');
        const size = Number(header[2]);
        if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= batch.length) throw new Error('Cannot read complete Git object history');
        const data = batch.subarray(end + 1, end + 1 + size);
        offset = end + 2 + size;
        if (header[1] !== 'blob') continue;
        for (const finding of scanFile(name, data)) findings.push({ ...finding, blob: oid });
    }
    return findings;
}

function scanAsar(file, label) {
    const asar = require('@electron/asar');
    return asar.listPackage(file).flatMap(name => {
        const normalized = name.replaceAll('\\', '/').replace(/^\//, '');
        const archivePath = path.normalize(normalized);
        const stat = asar.statFile(file, archivePath, false);
        if (stat.files) return [];
        if (stat.link) return [{ path: `${label}/${normalized}`, rule: 'archive-link' }];
        return scanFile(`${label}/${normalized}`, asar.extractFile(file, archivePath), 'artifact');
    });
}

function scanDirectory(directory, prefix = '') {
    const findings = [];
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, item.name), name = prefix + item.name;
        if (item.isSymbolicLink()) findings.push({ path: name, rule: 'filesystem-link' });
        else if (item.isDirectory()) findings.push(...scanDirectory(full, name + '/'));
        else if (item.name.endsWith('.asar')) findings.push(...scanAsar(full, name));
        else findings.push(...scanFile(name, fs.readFileSync(full), 'artifact'));
    }
    return findings;
}

function assertClean(findings) {
    if (findings.length) {
        console.error(JSON.stringify({ status: 'fail', findings }, null, 2));
        throw new Error(`Security audit blocked publication (${findings.length} findings).`);
    }
}

if (require.main === module) {
    try {
        const [mode = 'source', target] = process.argv.slice(2);
        let findings;
        if (mode === 'source' || mode === 'staged') findings = scanSource({ staged: mode === 'staged' });
        else if (mode === 'history') findings = scanHistory(target ? path.resolve(target) : root);
        else if (mode === 'artifact' && target) findings = scanDirectory(path.resolve(target));
        else throw new Error('Usage: security-audit.cjs source|staged|history [repo]|artifact <directory>');
        assertClean(findings);
        console.log(JSON.stringify({ status: 'pass', mode }));
    } catch (error) {
        // Avoid echoing subprocess stdout/stderr which may contain a credential.
        console.error(error.message.split('\n')[0]);
        process.exitCode = 1;
    }
}

module.exports = { scanFile, scanSource, scanHistory, scanDirectory, assertClean };
