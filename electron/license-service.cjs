/**
 * License Service Module
 * 授权服务模块 - 预留接口，方便后续升级
 * 
 * 授权等级：
 * - FREE: 免费版
 * - BASIC: 基础版
 * - PREMIUM: 高级版
 * 
 * 授权期限：
 * - MONTHLY: 月付
 * - PERMANENT: 永久
 */

const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// 授权等级枚举
const LicenseLevel = {
    FREE: 'FREE',
    BASIC: 'BASIC',
    PREMIUM: 'PREMIUM'
};

// 授权期限枚举
const LicenseDuration = {
    MONTHLY: 'MONTHLY',
    PERMANENT: 'PERMANENT'
};

// 授权状态
let currentLicense = {
    level: LicenseLevel.FREE,
    duration: null,
    expireDate: null,
    machineId: null,
    licenseKey: null,
    isValid: false
};

/**
 * 获取机器唯一标识
 * 基于 CPU ID + 硬盘序列号 + MAC 地址生成
 * @returns {string} 机器码
 */
function getMachineId() {
    try {
        let machineInfo = '';

        // 获取 CPU ID (Windows)
        try {
            const cpuId = execSync('wmic cpu get processorid', { encoding: 'utf8', windowsHide: true });
            machineInfo += cpuId.replace(/\s+/g, '');
        } catch (e) {
            console.warn('Failed to get CPU ID:', e.message);
        }

        // 获取硬盘序列号 (Windows)
        try {
            const diskId = execSync('wmic diskdrive get serialnumber', { encoding: 'utf8', windowsHide: true });
            machineInfo += diskId.replace(/\s+/g, '');
        } catch (e) {
            console.warn('Failed to get Disk ID:', e.message);
        }

        // 获取 MAC 地址 (Windows)
        try {
            const macAddr = execSync('getmac /fo csv /nh', { encoding: 'utf8', windowsHide: true });
            const firstMac = macAddr.split(',')[0].replace(/"/g, '');
            machineInfo += firstMac.replace(/[-:]/g, '');
        } catch (e) {
            console.warn('Failed to get MAC address:', e.message);
        }

        // 生成 SHA256 哈希作为机器码
        if (machineInfo.length > 0) {
            const hash = crypto.createHash('sha256').update(machineInfo).digest('hex');
            // 格式化为易读的格式：XXXX-XXXX-XXXX-XXXX
            currentLicense.machineId = hash.substring(0, 16).toUpperCase().match(/.{4}/g).join('-');
            return currentLicense.machineId;
        }

        return 'UNKNOWN-MACHINE-ID';
    } catch (error) {
        console.error('Error generating machine ID:', error);
        return 'ERROR-MACHINE-ID';
    }
}

/**
 * 验证授权码（离线验证）
 * TODO: 后续实现具体验证逻辑
 * @param {string} licenseKey - 授权码
 * @returns {object} 验证结果
 */
function verifyLicenseOffline(licenseKey) {
    // 预留接口 - 当前返回免费版状态
    // 后续实现：解密授权码，验证机器码绑定，检查有效期

    console.log('[LicenseService] Offline verification - Reserved for future implementation');

    return {
        isValid: false,
        level: LicenseLevel.FREE,
        duration: null,
        expireDate: null,
        message: '授权验证功能待开放'
    };
}

/**
 * 验证授权码（在线验证）
 * TODO: 后续实现服务端验证
 * @param {string} licenseKey - 授权码
 * @returns {Promise<object>} 验证结果
 */
async function verifyLicenseOnline(licenseKey) {
    // 预留接口 - 后续连接服务端验证
    // TODO: 实现在线验证逻辑

    console.log('[LicenseService] Online verification - Reserved for future implementation');

    return {
        isValid: false,
        level: LicenseLevel.FREE,
        duration: null,
        expireDate: null,
        message: '在线验证功能待开放'
    };
}

/**
 * 混合验证（推荐）
 * 先尝试在线验证，失败则回退到离线验证
 * @param {string} licenseKey - 授权码
 * @returns {Promise<object>} 验证结果
 */
async function verifyLicense(licenseKey) {
    if (!licenseKey) {
        return {
            isValid: false,
            level: LicenseLevel.FREE,
            message: '未提供授权码'
        };
    }

    // 当前版本：直接返回免费版状态
    // 后续版本：实现实际验证逻辑
    return verifyLicenseOffline(licenseKey);
}

/**
 * 获取当前授权等级
 * @returns {string} 授权等级
 */
function getLicenseLevel() {
    return currentLicense.level;
}

/**
 * 检查是否有权限使用某功能
 * @param {string} feature - 功能名称
 * @returns {boolean} 是否有权限
 */
function hasFeatureAccess(feature) {
    // 功能权限映射表
    const featurePermissions = {
        // 基础功能 - 所有版本可用
        'basic_launch': [LicenseLevel.FREE, LicenseLevel.BASIC, LicenseLevel.PREMIUM],
        'basic_settings': [LicenseLevel.FREE, LicenseLevel.BASIC, LicenseLevel.PREMIUM],

        // 进阶功能 - 基础版及以上
        'advanced_feature_1': [LicenseLevel.BASIC, LicenseLevel.PREMIUM],
        'advanced_feature_2': [LicenseLevel.BASIC, LicenseLevel.PREMIUM],

        // 高级功能 - 仅高级版
        'premium_feature_1': [LicenseLevel.PREMIUM],
        'premium_feature_2': [LicenseLevel.PREMIUM],
    };

    const allowedLevels = featurePermissions[feature];
    if (!allowedLevels) {
        // 未定义的功能默认开放
        return true;
    }

    return allowedLevels.includes(currentLicense.level);
}

/**
 * 检查授权是否过期
 * @returns {boolean} 是否过期
 */
function isLicenseExpired() {
    if (currentLicense.duration === LicenseDuration.PERMANENT) {
        return false;
    }

    if (!currentLicense.expireDate) {
        return true;
    }

    return new Date() > new Date(currentLicense.expireDate);
}

/**
 * 获取授权状态信息
 * @returns {object} 授权状态
 */
function getLicenseStatus() {
    return {
        machineId: currentLicense.machineId || getMachineId(),
        level: currentLicense.level,
        levelName: getLicenseLevelName(currentLicense.level),
        duration: currentLicense.duration,
        expireDate: currentLicense.expireDate,
        isValid: currentLicense.isValid,
        isExpired: isLicenseExpired()
    };
}

/**
 * 获取授权等级名称
 * @param {string} level - 授权等级
 * @returns {string} 等级名称
 */
function getLicenseLevelName(level) {
    const names = {
        [LicenseLevel.FREE]: '免费版',
        [LicenseLevel.BASIC]: '基础版',
        [LicenseLevel.PREMIUM]: '高级版'
    };
    return names[level] || '未知';
}

/**
 * 激活授权
 * @param {string} licenseKey - 授权码
 * @returns {Promise<object>} 激活结果
 */
async function activateLicense(licenseKey) {
    const result = await verifyLicense(licenseKey);

    if (result.isValid) {
        currentLicense = {
            ...currentLicense,
            level: result.level,
            duration: result.duration,
            expireDate: result.expireDate,
            licenseKey: licenseKey,
            isValid: true
        };

        // TODO: 保存授权信息到本地
    }

    return result;
}

/**
 * 初始化授权服务
 * 应用启动时调用
 */
/**
 * 初始化授权服务
 * 应用启动时调用
 */
function initLicenseService() {
    // console.log('[LicenseService] Initializing...');

    // 获取机器码
    const machineId = getMachineId();
    // console.log('[LicenseService] Machine ID:', machineId);

    // TODO: 加载本地保存的授权信息并验证

    // console.log('[LicenseService] Current level:', currentLicense.level);
    // console.log('[LicenseService] Initialized successfully');
}

module.exports = {
    // 枚举
    LicenseLevel,
    LicenseDuration,

    // 核心方法
    getMachineId,
    verifyLicense,
    verifyLicenseOffline,
    verifyLicenseOnline,
    activateLicense,

    // 状态查询
    getLicenseLevel,
    getLicenseStatus,
    hasFeatureAccess,
    isLicenseExpired,

    // 初始化
    initLicenseService
};
