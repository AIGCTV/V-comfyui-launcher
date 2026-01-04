import React, { useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, ExternalLink, Loader2, AlertCircle, Globe } from 'lucide-react';
import { VersionInfo } from '../types';
import { fetchVersions, fetchAllVersions } from '../services/githubService';
import { useTranslation } from '../i18n';

interface VersionsProps {
    onUpdate: (version: VersionInfo) => void;
    currentVersionId: string;
    isUpdating: boolean;
    useProxy: boolean;
    onProxyToggle: (enabled: boolean) => void;
    localVersion?: { hash: string, fullHash: string, date: string };
}

export const Versions: React.FC<VersionsProps> = ({ onUpdate, currentVersionId, isUpdating, useProxy, onProxyToggle, localVersion }) => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'stable' | 'dev'>('stable');
    const [stableVersions, setStableVersions] = useState<VersionInfo[]>([]);
    const [devVersions, setDevVersions] = useState<VersionInfo[]>([]);
    const [loading, setLoading] = useState(false);

    // Get current display list based on active tab
    const versions = activeTab === 'stable' ? stableVersions : devVersions;

    // Unified refresh - fetches both lists at once
    const refreshAll = async (force = false) => {
        console.log(`[Versions] refreshAll called, force=${force}`);
        setLoading(true);
        try {
            const { stable, dev } = await fetchAllVersions(force);
            console.log(`[Versions] Got stable: ${stable.length}, dev: ${dev.length}`);
            setStableVersions(stable);
            setDevVersions(dev);
        } catch (error) {
            console.error('[Versions] Error in refreshAll:', error);
        } finally {
            setLoading(false);
        }
    };

    // Load from cache on mount
    useEffect(() => {
        console.log('[Versions] Initial load from cache');
        refreshAll(false);
    }, []);

    return (
        <div className="h-full flex flex-col bg-gray-900 text-gray-100 overflow-hidden">

            {/* Header Section */}
            <div className="p-6 pb-2">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-400 text-sm">远端地址:</span>
                            <a href="https://github.com/comfyanonymous/ComfyUI" target="_blank" rel="noreferrer" className="font-mono text-sm text-blue-400 hover:underline flex items-center gap-1">
                                https://github.com/comfyanonymous/ComfyUI <ExternalLink size={10} />
                            </a>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-gray-400 text-sm">当前分支:</span>
                            <span className="font-mono text-sm text-gray-200">master</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-sm">当前版本:</span>
                            <span className={`font-mono text-sm ${isUpdating ? 'text-yellow-400 animate-pulse' : 'text-green-400'}`}>
                                {localVersion?.fullHash || currentVersionId}
                            </span>
                            {localVersion?.date && (
                                <span className={`text-sm ${isUpdating ? 'text-yellow-400 animate-pulse' : 'text-green-400'}`}>
                                    {localVersion.date}
                                </span>
                            )}
                            {isUpdating && <span className="text-yellow-400 text-sm">(更新中...)</span>}
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => onProxyToggle(!useProxy)}
                            className={`px-3 py-1.5 border rounded text-xs flex items-center gap-2 transition-colors ${useProxy
                                ? 'bg-green-600 border-green-500 text-white hover:bg-green-700'
                                : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'
                                }`}
                            title={useProxy ? 'GitHub代理已启用,点击关闭' : 'GitHub代理已关闭,点击启用'}
                        >
                            <Globe size={14} /> {useProxy ? '代理: 开' : '代理: 关'}
                        </button>
                        <button
                            onClick={() => refreshAll(true)}
                            disabled={loading}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-xs flex items-center gap-2 transition-colors"
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> 刷新列表
                        </button>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex items-end gap-1 border-b border-gray-700">
                    <button
                        onClick={() => setActiveTab('stable')}
                        className={`px-6 py-2 text-sm font-medium rounded-t-lg transition-all relative top-[1px] ${activeTab === 'stable'
                            ? 'bg-gr00 text-white border-t border-l border-r border-gray-700'
                            : 'bg-trarent text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        稳定版
                    </button>
                    <button
                        onClick={() => setActiveTab('dev')}
                        className={`px-6 py-2 text-sm font-medium rounded-t-lg transition-all relative top-[1px] ${activeTab === 'dev'
                            ? 'bg-gr00 text-white border-t border-l border-r border-gray-700'
                            : 'bg-trarent text-gray-500 hover:text-gray-300'
                            }`}
                    >
                        开发版
                    </button>
                </div>
            </div>

            {/* Table Data Grid */}
            <div className="flex-1 px-6 pb-6 overflow-hidden flex flex-col">
                <div className="bg-gray-800 border border-gray-700 rounded-b-lg rounded-tr-lg flex flex-col h-full shadow-inner">
                    <div className="grid grid-cols-12 bg-gray-900/50 p-3 text-xs font-bold text-gray-400 border-b border-gray-700">
                        <div className="col-span-2 pl-2">版本 ID (Hash)</div>
                        <div className="col-span-6">更新内容</div>
                        <div className="col-span-3">日期</div>
                        <div className="col-span-1 text-center">操作</div>
                    </div>
                    <div className="overflow-x-auto overflow-y-auto flex-1 scrollbar-default bg-[#1e1e1e]">
                        {loading ? (
                            <div className="flex items-center justify-center h-full text-gray-500 gap-2">
                                <RefreshCw className="animate-spin" size={20} /> 获取版本信息中...
                            </div>
                        ) : (
                            <table className="w-full border-collapse min-w-[900px]">
                                <tbody>
                                    {versions.map((ver, idx) => {
                                        // Match by short hash (7 chars) or full hash
                                        const isCurrent = ver.id === currentVersionId ||
                                            (localVersion?.fullHash && ver.fullId === localVersion.fullHash) ||
                                            (localVersion?.hash && ver.id === localVersion.hash);

                                        // Debug first 3 items
                                        if (idx < 3) {
                                            console.log(`[Match] ver.id="${ver.id}", ver.fullId="${ver.fullId}", currentVersionId="${currentVersionId}", localHash="${localVersion?.hash}", localFull="${localVersion?.fullHash}", isCurrent=${isCurrent}`);
                                        }

                                        const isLinkable = ver.fullId && ver.id !== 'Error';
                                        return (
                                            <tr key={ver.id + ver.date} className={`border-b border-gray-800 transition-colors text-sm group ${isCurrent ? 'bg-green-900/20 hover:bg-green-900/30' : 'hover:bg-gray-700/40'}`}>
                                                <td className="py-3 pl-4 col-span-2 w-[16%] font-mono">
                                                    {isLinkable ? (
                                                        <a href={`https://github.com/comfyanonymous/ComfyUI/commit/${ver.fullId || ver.id}`} target="_blank" rel="noreferrer" className={`flex items-center gap-1 hover:underline ${isCurrent ? 'text-green-400 font-bold' : 'text-blue-400'}`}>
                                                            {ver.id} <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                                                        </a>
                                                    ) : (
                                                        <span className="flex items-center gap-2 text-red-400">{ver.id}</span>
                                                    )}
                                                </td>
                                                <td className={`py-3 pr-4 max-w-[400px] ${isCurrent ? 'text-green-300' : 'text-gray-300'}`}>
                                                    <div className="truncate" title={ver.message}>{ver.message}</div>
                                                </td>
                                                <td className={`py-3 w-[25%] font-mono text-xs ${isCurrent ? 'text-green-400/70' : 'text-gray-400'}`}>{ver.date}</td>
                                                <td className="py-3 w-[9%] text-center pr-2">
                                                    {isCurrent ? <CheckCircle2 size={18} className="text-green-500 mx-auto" /> : (
                                                        <button onClick={() => onUpdate(ver)} disabled={isUpdating || !isLinkable} className={`px-3 py-1 border rounded text-xs mx-auto w-16 ${(isUpdating || !isLinkable) ? 'border-gray-700 text-gray-600' : 'border-gray-600 text-gray-400 hover:text-white hover:bg-gray-700'}`}>切换</button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
