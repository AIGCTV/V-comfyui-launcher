import React, { useState, useEffect } from 'react';
import { Play, Square, Cpu, Zap, Folder, FolderInput, FolderOutput, FileJson } from 'lucide-react';
import { AppStatus, RunMode } from '../types';
import { useTranslation } from '../i18n';

interface DashboardProps {
    status: AppStatus;
    mode: RunMode;
    comfyVersion: { hash: string; date: string };
    launcherVersion?: { version: string; buildDate: string };
    onToggleMode: (mode: RunMode) => void;
    onStart: () => void;
    onStop: () => void;
}

// CDN 配置 URL（使用 jsDelivr 加速 GitHub Raw，确保国内访问稳定性）
const CONFIG_URL = 'https://cdn.jsdelivr.net/gh/AIGCTV/V-comfyui-launcher@main/launcher-config.json';

// 默认配置（本地兜底，确保离线可用）
const DEFAULT_CONFIG = {
    // 使用 public 目录下的本地图片作为默认兜底
    banner: 'banner.png',
    announcement: {
        title: '欢迎使用 AIGCTV 启动器',
        time: '2025-12-17'
    }
};

// 辅助函数：将 GitHub Raw 链接转换为 jsDelivr CDN 链接
const convertToCdnUrl = (url: string) => {
    if (!url) return url;
    // 如果是 GitHub Raw 链接
    if (url.includes('raw.githubusercontent.com')) {
        // 替换规则：
        // https://raw.githubusercontent.com/user/repo/branch/file
        // -> https://cdn.jsdelivr.net/gh/user/repo@branch/file
        return url.replace('raw.githubusercontent.com', 'cdn.jsdelivr.net/gh')
            .replace('/main/', '@main/')
            .replace('/master/', '@master/');
    }
    return url;
};

// 目录快捷方式配置（label 为翻译 key）
const DIRECTORY_SHORTCUTS = [
    { labelKey: 'dashboard.rootDir', path: '', icon: Folder },
    { labelKey: 'dashboard.inputDir', path: 'ComfyUI\\input', icon: FolderInput },
    { labelKey: 'dashboard.outputDir', path: 'ComfyUI\\output', icon: FolderOutput },
    { labelKey: 'dashboard.workflowDir', path: 'ComfyUI\\user\\default\\workflows', icon: FileJson }
];

export const Dashboard: React.FC<DashboardProps> = ({
    status,
    mode,
    comfyVersion,
    launcherVersion = { version: '1.0.1', buildDate: '2025-12-26 00:00:00' },
    onToggleMode,
    onStart,
    onStop
}) => {
    // i18n
    const { t } = useTranslation();

    // Remote config state
    const [config, setConfig] = useState(DEFAULT_CONFIG);

    // Load remote config on mount
    useEffect(() => {
        const loadRemoteConfig = async () => {
            // 1. 先立即使用缓存配置（如果有），确保快速显示
            const cached = localStorage.getItem('launcher_config');
            if (cached) {
                try {
                    const cachedConfig = JSON.parse(cached);
                    // 确保缓存的配置也经过 CDN 转换（如果是旧缓存）
                    cachedConfig.banner = convertToCdnUrl(cachedConfig.banner);
                    setConfig(cachedConfig);
                    console.log('[Dashboard] Loaded cached config instantly');
                } catch (e) {
                    console.warn('[Dashboard] Failed to parse cached config');
                }
            }

            // 2. 后台静默拉取最新配置（不阻塞 UI）
            try {
                console.log('[Dashboard] Fetching remote config from:', CONFIG_URL);

                // 添加超时控制
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000); // CDN 通常很快，但给 8 秒宽限

                const response = await fetch(CONFIG_URL, {
                    cache: 'no-cache',
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    const remoteConfig = await response.json();

                    // 自动优化：如果远程配置用了 GitHub Raw 图片，转为 CDN 链接
                    if (remoteConfig.banner) {
                        remoteConfig.banner = convertToCdnUrl(remoteConfig.banner);
                    }

                    console.log('[Dashboard] Remote config updated successfully');
                    setConfig(remoteConfig);
                    localStorage.setItem('launcher_config', JSON.stringify(remoteConfig));
                    localStorage.setItem('launcher_config_time', Date.now().toString());
                } else {
                    console.log('[Dashboard] Remote fetch failed (status: ' + response.status + '), using cached/default config');
                }
            } catch (error) {
                // 网络错误或超时，静默处理
                if (error instanceof Error && error.name === 'AbortError') {
                    console.log('[Dashboard] Remote config fetch timed out');
                } else {
                    console.log('[Dashboard] Network error, using cached/default config:', error);
                }
            }
        };

        loadRemoteConfig();
    }, []);

    // Load saved mode from localStorage
    useEffect(() => {
        const savedMode = localStorage.getItem('comfyui_run_mode');
        if (savedMode && (savedMode === 'CPU' || savedMode === 'GPU')) {
            onToggleMode(savedMode as RunMode);
        }
    }, []);

    const handleModeToggle = (newMode: RunMode) => {
        onToggleMode(newMode);
        localStorage.setItem('comfyui_run_mode', newMode);
    };

    const handleOpenDirectory = async (path: string) => {
        if (window.electronAPI && (window.electronAPI as any).openDirectory) {
            try {
                await (window.electronAPI as any).openDirectory(path);
            } catch (error) {
                console.error('Failed to open directory:', error);
            }
        }
    };

    const isRunning = status === AppStatus.RUNNING || status === AppStatus.STARTING;

    return (
        <div className="h-full flex flex-col bg-gray-900 relative">

            {/* Enlarged Banner Image */}
            <div className="flex-1 relative overflow-hidden">
                <div
                    className="absolute inset-0 bg-contain bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${config.banner})` }}
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-gray-900"></div>
                </div>
            </div>

            {/* Bottom Section */}
            <div className="shrink-0 bg-gray-850 border-t border-gray-800 shadow-[0_-5px_20px_rgba(0,0,0,0.3)]">

                {/* Announcement Row - Compact Single Line */}
                <div className="px-8 py-2 border-b border-gray-800/50 bg-gray-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-cyan-400">📢 {t('dashboard.announcement')}</span>
                            <span className="text-xs text-gray-300">{config.announcement.title}</span>
                        </div>
                        <span className="text-xs text-gray-500">{config.announcement.time}</span>
                    </div>
                </div>

                {/* Directory Shortcuts Row */}
                <div className="px-8 py-4 border-b border-gray-800/50">
                    <div className="flex items-center justify-center gap-2">
                        {DIRECTORY_SHORTCUTS.map((dir) => {
                            const Icon = dir.icon;
                            return (
                                <button
                                    key={dir.labelKey}
                                    onClick={() => handleOpenDirectory(dir.path)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500/50 rounded-lg transition-all group"
                                    title={dir.path || 'ComfyUI'}
                                >
                                    <Icon size={16} className="text-blue-400 group-hover:text-blue-300" />
                                    <span className="text-sm text-gray-300 group-hover:text-white">{t(dir.labelKey)}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Control Bar Row */}
                <div className="px-8 py-4 flex items-center justify-between">

                    {/* Left: Version Info */}
                    <div className="flex flex-col gap-1.5 text-sm">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 w-24">{t('dashboard.launcherVersion')}:</span>
                            <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs font-mono font-bold min-w-[70px] text-center">V{launcherVersion.version}</span>
                            <span className="text-gray-500 text-xs">{launcherVersion.buildDate}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 w-24 whitespace-nowrap">{t('dashboard.comfyVersion')}:</span>
                            <span className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded text-xs font-mono font-bold min-w-[70px] text-center">
                                {comfyVersion.hash || 'Checking...'}
                            </span>
                            {comfyVersion.date && <span className="text-gray-500 text-xs">{comfyVersion.date}</span>}
                        </div>
                    </div>

                    {/* Right: Controls */}
                    <div className="flex items-center gap-6">

                        {/* Run Mode Switch */}
                        <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                            <button
                                onClick={() => !isRunning && handleModeToggle(RunMode.CPU)}
                                className={`px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-all ${mode === RunMode.CPU
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <Cpu size={16} /> CPU
                            </button>
                            <button
                                onClick={() => !isRunning && handleModeToggle(RunMode.GPU)}
                                className={`px-4 py-2 rounded flex items-center gap-2 text-sm font-medium transition-all ${mode === RunMode.GPU
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                                    } ${isRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <Zap size={16} /> GPU
                            </button>
                        </div>

                        {/* Separator */}
                        <div className="h-10 w-px bg-gray-700"></div>

                        {/* Status & Action */}
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <div className="text-xs text-gray-400 uppercase tracking-wider font-semibold">{t('dashboard.status')}</div>
                                <div className={`font-bold ${status === AppStatus.RUNNING ? 'text-green-400' :
                                    status === AppStatus.STARTING ? 'text-yellow-400' : 'text-gray-500'
                                    }`}>
                                    {status === AppStatus.RUNNING ? t('dashboard.running') :
                                        status === AppStatus.STARTING ? t('dashboard.starting') : t('dashboard.stopped')}
                                </div>
                            </div>

                            <button
                                onClick={isRunning ? onStop : onStart}
                                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg transition-all transform hover:scale-105 active:scale-95 ${isRunning
                                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/30'
                                    : 'bg-green-500 hover:bg-green-600 text-white shadow-green-500/30'
                                    }`}
                            >
                                {isRunning ? <Square fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} className="ml-1" />}
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};
