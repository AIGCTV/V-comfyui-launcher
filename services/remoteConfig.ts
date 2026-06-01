/**
 * Remote launcher configuration service.
 *
 * The public repository keeps launcher-config.json for CDN-delivered content.
 * User-specific runtime settings live in ignored local files and must not be
 * mixed into this remote content config.
 */

export const CONFIG_URL = 'https://cdn.jsdelivr.net/gh/AIGCTV/V-comfyui-launcher@main/launcher-config.json';

const CACHE_KEY = 'launcher_config';
const CACHE_TIME_KEY = 'launcher_config_time';
const CACHE_VERSION_KEY = 'launcher_config_version';
const CURRENT_CACHE_VERSION = '3';
const FETCH_TIMEOUT = 8000;

export interface ResourceConfig {
    id: string;
    url: string;
}

export interface TutorialConfig {
    title: string;
    platform: string;
    views: string;
    url: string;
}

export interface TutorialsConfig {
    viewMoreUrl: string;
    list: TutorialConfig[];
}

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

export const DEFAULT_RESOURCES: ResourceConfig[] = [
    { id: 'comfyPack', url: 'https://fcnindgiaxi4.feishu.cn/wiki/UcqtwbJzeiX5dbkiNGBcoClInlg' },
    { id: 'modelLib', url: 'https://pan.quark.cn/s/cc750e23e454' },
    { id: 'knowledgeBase', url: 'https://fcnindgiaxi4.feishu.cn/wiki/S50Hwm8qBiFM2YkTmhPcTwSnn2d' },
    { id: 'codeRepo', url: 'https://github.com/AIGCTV/comfyui-photoshop-fix' },
    { id: 'welfare', url: 'https://fcnindgiaxi4.feishu.cn/wiki/YgQKwKKqDigMvak1xrLczvOrnOb' },
];

export const DEFAULT_TUTORIALS: TutorialsConfig = {
    viewMoreUrl: 'https://www.iesdouyin.com/share/playlet/detail/7410359478745073715',
    list: [
        {
            title: 'PS-AI plugin complete workflow',
            platform: 'Bilibili',
            views: '2M+ views',
            url: 'https://space.bilibili.com/3546670109296710/lists/6277151',
        },
        {
            title: 'PS-Stone AI plugin tutorial',
            platform: 'Bilibili',
            views: '100K+ views',
            url: 'https://space.bilibili.com/3546670109296710/lists/6276896',
        },
    ],
};

export const DEFAULT_CONFIG: LauncherConfig = {
    banner: 'banner.png',
    announcement: {
        title: 'Welcome to AIGCTV Launcher',
        title_zh: '欢迎使用 AIGCTV 启动器',
        title_en: 'Welcome to AIGCTV Launcher',
        time: '2025-12-17',
    },
    resources: DEFAULT_RESOURCES,
    tutorials: DEFAULT_TUTORIALS,
};

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

export const getCachedConfig = (): LauncherConfig | null => {
    try {
        const cachedVersion = localStorage.getItem(CACHE_VERSION_KEY);
        if (cachedVersion !== CURRENT_CACHE_VERSION) {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIME_KEY);
            localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
            return null;
        }

        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const config = JSON.parse(cached) as LauncherConfig;
            config.banner = convertToCdnUrl(config.banner);
            return config;
        }
    } catch (e) {
        console.warn('[RemoteConfig] Failed to parse cached config:', e);
    }
    return null;
};

export const setCachedConfig = (config: LauncherConfig): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(config));
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
    } catch (e) {
        console.warn('[RemoteConfig] Failed to cache config:', e);
    }
};

export const fetchRemoteConfig = async (): Promise<LauncherConfig | null> => {
    try {
        const dynamicUrl = `${CONFIG_URL}?t=${Date.now()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        const response = await fetch(dynamicUrl, {
            cache: 'no-store',
            headers: {
                Accept: 'application/json',
            },
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const config = await response.json() as LauncherConfig;
            if (config.banner) {
                config.banner = convertToCdnUrl(config.banner);
            }
            return config;
        }

        console.warn('[RemoteConfig] Fetch failed with status:', response.status);
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('[RemoteConfig] Fetch timed out');
        } else {
            console.warn('[RemoteConfig] Network error:', error);
        }
    }
    return null;
};

export const loadConfig = async (
    onUpdate?: (config: LauncherConfig) => void
): Promise<LauncherConfig> => {
    const cached = getCachedConfig();
    const currentConfig = cached || DEFAULT_CONFIG;

    const remoteConfig = await fetchRemoteConfig();
    if (remoteConfig) {
        const mergedConfig: LauncherConfig = {
            ...DEFAULT_CONFIG,
            ...remoteConfig,
            announcement: {
                title: remoteConfig.announcement?.title ?? DEFAULT_CONFIG.announcement.title,
                time: remoteConfig.announcement?.time ?? DEFAULT_CONFIG.announcement.time,
                title_zh: remoteConfig.announcement?.title_zh,
                title_en: remoteConfig.announcement?.title_en,
            },
            resources: remoteConfig.resources || DEFAULT_RESOURCES,
            tutorials: remoteConfig.tutorials || DEFAULT_TUTORIALS,
        };

        setCachedConfig(mergedConfig);
        onUpdate?.(mergedConfig);
        return mergedConfig;
    }

    return currentConfig;
};

export const getResourcesConfig = (): ResourceConfig[] => {
    const cached = getCachedConfig();
    return cached?.resources || DEFAULT_RESOURCES;
};

export const getTutorialsConfig = (): TutorialsConfig => {
    const cached = getCachedConfig();
    return cached?.tutorials || DEFAULT_TUTORIALS;
};
