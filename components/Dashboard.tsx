import React, { useState, useEffect } from 'react';
import { Play, Square, Cpu, Zap, Folder, FolderInput, FolderOutput, FileJson } from 'lucide-react';
import { AppStatus, RunMode } from '../types';
import { useTranslation } from '../i18n';
import {
    loadConfig,
    getCachedConfig,
    LauncherConfig,
    DEFAULT_CONFIG,
} from '../services/remoteConfig';

interface DashboardProps {
    status: AppStatus;
    mode: RunMode;
    comfyVersion: { hash: string; date: string };
    launcherVersion?: { version: string; buildDate: string };
    onToggleMode: (mode: RunMode) => void;
    onStart: () => void;
    onStop: () => void;
}

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
    const { t, language } = useTranslation();

    // Remote config state - 使用共享配置服务
    const [config, setConfig] = useState<LauncherConfig>(() => getCachedConfig() || DEFAULT_CONFIG);

    // Load remote config on mount - 使用共享配置服务
    useEffect(() => {
        loadConfig((updatedConfig) => {
            // 远程配置更新回调
            setConfig(updatedConfig);
        });
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

    // Determine announcement title based on language
    const announcementTitle = (language === 'en' && config.announcement.title_en)
        ? config.announcement.title_en
        : (language === 'zh' && config.announcement.title_zh)
            ? config.announcement.title_zh
            : config.announcement.title;

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
                            <span className="text-xs text-gray-300">{announcementTitle}</span>
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
