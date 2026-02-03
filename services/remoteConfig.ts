/**
 * 远程配置服务模块
 * 提供统一的远程配置加载、缓存和管理功能
 * 
 * 设计原则：
 * 1. 优先使用本地缓存，确保快速显示
 * 2. 后台静默更新，不阻塞 UI
 * 3. 网络失败时静默降级，使用默认配置
 */

// CDN 配置 URL（使用 jsDelivr 加速 GitHub Raw，确保国内访问稳定性）
export const CONFIG_URL = 'https://cdn.jsdelivr.net/gh/AIGCTV/V-comfyui-launcher@main/launcher-config.json';

// localStorage 缓存键名
const CACHE_KEY = 'launcher_config';
const CACHE_TIME_KEY = 'launcher_config_time';

// 请求超时时间（毫秒）
const FETCH_TIMEOUT = 8000;

// 资源链接配置
export interface ResourceConfig {
    id: string;
    url: string;
}

// 教程配置
export interface TutorialConfig {
    title: string;
    platform: string;
    views: string;
    url: string;
}

// 教程区块配置
export interface TutorialsConfig {
    viewMoreUrl: string;
    list: TutorialConfig[];
}

// 完整配置类型定义
export interface LauncherConfig {
    banner: string;
    announcement: {
        title: string;
        title_zh?: string;
        title_en?: string;
        time: string;
    };
    resources?: ResourceConfig[];
    tutorials?: TutorialsConfig;
}

// 默认资源配置（本地兜底）
export const DEFAULT_RESOURCES: ResourceConfig[] = [
    { id: 'comfyPack', url: 'https://fcnindgiaxi4.feishu.cn/wiki/UcqtwbJzeiX5dbkiNGBcoClInlg' },
    { id: 'modelLib', url: 'https://pan.quark.cn/s/cc750e23e454' },
    { id: 'knowledgeBase', url: 'https://fcnindgiaxi4.feishu.cn/wiki/S50Hwm8qBiFM2YkTmhPcTwSnn2d' },
    { id: 'codeRepo', url: 'https://github.com/AIGCTV/comfyui-photoshop-fix' },
    { id: 'welfare', url: 'https://fcnindgiaxi4.feishu.cn/wiki/YgQKwKKqDigMvak1xrLczvOrnOb' },
];

// 默认教程配置（本地兜底）
export const DEFAULT_TUTORIALS: TutorialsConfig = {
    viewMoreUrl: 'https://www.iesdouyin.com/share/playlet/detail/7410359478745073715',
    list: [
        { title: 'PS-AI插件使用全攻略', platform: 'B站', views: '全网200W+', url: 'https://space.bilibili.com/3546670109296710/lists/6277151' },
        { title: 'PS-石头AI插件教程', platform: 'B站', views: '全网10W+', url: 'https://space.bilibili.com/3546670109296710/lists/6276896' },
    ],
};

// 默认完整配置（本地兜底）
export const DEFAULT_CONFIG: LauncherConfig = {
    banner: 'banner.png',
    announcement: {
        title: '欢迎使用 AIGCTV 启动器',
        title_zh: '欢迎使用 AIGCTV 启动器',
        title_en: 'Welcome to AIGCTV Launcher',
        time: '2025-12-17',
    },
    resources: DEFAULT_RESOURCES,
    tutorials: DEFAULT_TUTORIALS,
};

/**
 * 将 GitHub Raw 链接转换为 jsDelivr CDN 链接
 * 提升国内访问速度和稳定性
 */
export const convertToCdnUrl = (url: string): string => {
    if (!url) return url;
    if (url.includes('raw.githubusercontent.com')) {
        return url
            .replace('raw.githubusercontent.com', 'cdn.jsdelivr.net/gh')
            .replace('/main/', '@main/')
            .replace('/master/', '@master/');
    }
    return url;
};

/**
 * 从 localStorage 读取缓存的配置
 */
export const getCachedConfig = (): LauncherConfig | null => {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const config = JSON.parse(cached) as LauncherConfig;
            // 确保缓存的 banner URL 也经过 CDN 转换
            config.banner = convertToCdnUrl(config.banner);
            return config;
        }
    } catch (e) {
        console.warn('[RemoteConfig] Failed to parse cached config:', e);
    }
    return null;
};

/**
 * 将配置保存到 localStorage 缓存
 */
export const setCachedConfig = (config: LauncherConfig): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(config));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch (e) {
        console.warn('[RemoteConfig] Failed to cache config:', e);
    }
};

/**
 * 从远程服务器获取最新配置
 * 支持超时控制，网络错误时静默降级
 */
export const fetchRemoteConfig = async (): Promise<LauncherConfig | null> => {
    try {
        console.log('[RemoteConfig] Fetching from:', CONFIG_URL);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(CONFIG_URL, {
            cache: 'no-cache',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const config = await response.json() as LauncherConfig;
            // 自动优化：将 GitHub Raw 图片转为 CDN 链接
            if (config.banner) {
                config.banner = convertToCdnUrl(config.banner);
            }
            console.log('[RemoteConfig] Fetched successfully');
            return config;
        } else {
            console.warn('[RemoteConfig] Fetch failed with status:', response.status);
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('[RemoteConfig] Fetch timed out');
        } else {
            console.warn('[RemoteConfig] Network error:', error);
        }
    }
    return null;
};

/**
 * 加载配置的主入口
 * 策略：优先返回缓存，后台更新
 * 
 * @param onUpdate 当远程配置更新时的回调函数
 * @returns 当前可用的配置（缓存或默认值）
 */
export const loadConfig = async (
    onUpdate?: (config: LauncherConfig) => void
): Promise<LauncherConfig> => {
    // 1. 优先使用缓存配置
    const cached = getCachedConfig();
    const currentConfig = cached || DEFAULT_CONFIG;

    // 2. 后台拉取最新配置
    const remoteConfig = await fetchRemoteConfig();
    if (remoteConfig) {
        const mergedConfig: LauncherConfig = {
            ...DEFAULT_CONFIG,
            ...remoteConfig,
            announcement: {
                ...DEFAULT_CONFIG.announcement,
                ...(remoteConfig.announcement || {})
            },
            resources: remoteConfig.resources || DEFAULT_RESOURCES,
            tutorials: remoteConfig.tutorials || DEFAULT_TUTORIALS,
        };
        setCachedConfig(mergedConfig);
        // 通知调用方配置已更新
        if (onUpdate) {
            onUpdate(mergedConfig);
        }
        return mergedConfig;
    }

    return currentConfig;
};

/**
 * 获取资源链接配置
 * 优先从缓存读取，如果没有则返回默认值
 */
export const getResourcesConfig = (): ResourceConfig[] => {
    const cached = getCachedConfig();
    return cached?.resources || DEFAULT_RESOURCES;
};

/**
 * 获取教程配置
 * 优先从缓存读取，如果没有则返回默认值
 */
export const getTutorialsConfig = (): TutorialsConfig => {
    const cached = getCachedConfig();
    return cached?.tutorials || DEFAULT_TUTORIALS;
};
