import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, FolderOpen, Loader2, RefreshCw } from 'lucide-react';
import { AppSettings, PSBridgeProgress, PSBridgeResult, PSBridgeStatus } from '../types';
import { useTranslation } from '../i18n';

const ERROR_CODES = new Set(['UNMANAGED_INSTALL', 'LOCAL_CHANGES', 'COMFY_RUNNING', 'BUSY', 'PYTHON_MISSING', 'ENVIRONMENT_INVALID', 'PATH_INVALID', 'MIRROR_INVALID', 'RATE_LIMITED', 'DOWNLOAD_FAILED', 'DOWNLOAD_TIMEOUT', 'ARCHIVE_INVALID', 'DATA_CONFLICT', 'DEPENDENCY_FAILED', 'VALIDATION_FAILED', 'INSTALL_FAILED', 'RECOVERY_REQUIRED', 'PROCESS_CHECK_FAILED']);

export const PSBridgeSettings: React.FC<{ settings: AppSettings }> = ({ settings }) => {
    const { t } = useTranslation();
    const [status, setStatus] = useState<PSBridgeStatus | null>(null);
    const [result, setResult] = useState<PSBridgeResult | null>(null);
    const [progress, setProgress] = useState<PSBridgeProgress | null>(null);
    const [updating, setUpdating] = useState(false);
    const mounted = useRef(false);
    const requestId = useRef(0);
    const available = Boolean(window.electronAPI?.getPSBridgeStatus);
    const busy = updating || status?.state === 'busy';

    const refresh = useCallback(async () => {
        if (!window.electronAPI?.getPSBridgeStatus) return;
        const id = ++requestId.current;
        try {
            const next = await window.electronAPI.getPSBridgeStatus();
            if (!mounted.current || id !== requestId.current) return;
            setStatus(next);
            if (next.progress) setProgress(next.progress);
            if (next.lastResult) setResult(next.lastResult);
        } catch (error) {
            if (mounted.current && id === requestId.current) setResult({ success: false, code: 'INSTALL_FAILED', message: String(error) });
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        const unsubscribe = window.electronAPI?.onPSBridgeProgress?.(next => {
            if (mounted.current) setProgress(next);
        });
        window.addEventListener('focus', refresh);
        return () => { mounted.current = false; requestId.current++; unsubscribe?.(); window.removeEventListener('focus', refresh); };
    }, [refresh]);

    useEffect(() => { void refresh(); }, [refresh, settings.pythonPath]);
    useEffect(() => {
        if (!busy) return;
        const timer = window.setInterval(refresh, 1500);
        return () => window.clearInterval(timer);
    }, [busy, refresh]);

    const install = async () => {
        if (busy || !status?.canUpdate) return;
        setUpdating(true);
        setResult(null);
        setProgress({ stage: 'checking' });
        try {
            const next = await window.electronAPI.updatePSBridge();
            if (mounted.current) setResult(next);
        } catch (error) {
            if (mounted.current) setResult({ success: false, code: 'INSTALL_FAILED', message: String(error) });
        } finally {
            if (mounted.current) { setUpdating(false); await refresh(); }
        }
    };

    const openDirectory = async () => {
        try {
            const opened = await window.electronAPI.openPSBridgeDirectory();
            if (!opened.success) setResult({ success: false, code: 'PATH_INVALID', message: opened.message });
        } catch (error) { setResult({ success: false, code: 'PATH_INVALID', message: String(error) }); }
    };

    const error = !busy && (result && !result.success ? result : status?.state === 'blocked' ? status : null);
    const phase = progress?.stage || 'checking';
    const version = result?.success ? result.version : status?.version;
    const commit = result?.success ? result.commit : status?.commit;

    return (
        <section aria-labelledby="ps-bridge-heading" data-testid="ps-bridge-settings">
            <div className="flex items-center gap-4 mb-5">
                <div className="h-7 w-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]" />
                <h1 id="ps-bridge-heading" className="text-xl font-bold text-white tracking-wide">{t('settings.bridge.title')}</h1>
                <div className="h-px bg-gray-800 flex-1 ml-4" />
            </div>
            <div className="p-5 bg-gray-800/30 rounded-xl border border-gray-700/50 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-white font-medium">ComfyUI PS Bridge Nodes</h2>
                        <p className="text-gray-400 text-xs mt-1">{t('settings.bridge.description')}</p>
                    </div>
                    <button type="button" onClick={() => window.electronAPI?.openUrl('https://github.com/AIGCTV/comfyui-ps-bridge-nodes')}
                        disabled={!available} className="text-cyan-400 text-sm flex items-center gap-1.5 hover:text-cyan-300 disabled:opacity-50">
                        <ExternalLink size={14} />{t('settings.bridge.project')}
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2 py-1 rounded bg-gray-900 text-gray-300">{t('settings.bridge.version')}: {version ? `${version} · ${commit?.slice(0, 7) || ''}` : t('settings.bridge.notInstalled')}</span>
                    <span className="text-gray-500">{t('settings.bridge.channel')}</span>
                </div>
                <div>
                    <label htmlFor="ps-bridge-path" className="block text-xs text-gray-400 mb-2">{t('settings.bridge.directory')}</label>
                    <div className="flex gap-2">
                        <input id="ps-bridge-path" readOnly value={status?.installPath || ''} placeholder={t('settings.bridge.detecting')}
                            className="min-w-0 flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-300 text-sm" />
                        <button type="button" onClick={openDirectory} disabled={!status?.installPath || busy}
                            title={t('settings.bridge.openDirectory')} aria-label={t('settings.bridge.openDirectory')}
                            className="px-3 bg-gray-700 rounded-lg text-gray-300 hover:bg-gray-600 disabled:opacity-50"><FolderOpen size={16} /></button>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={install} disabled={!available || !status?.canUpdate || busy}
                        className="px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-2">
                        {busy ? <Loader2 size={16} className="animate-spin" /> : version ? <RefreshCw size={16} /> : <Download size={16} />}
                        {busy ? t('settings.bridge.working') : version ? t('settings.bridge.update') : t('settings.bridge.install')}
                    </button>
                    <button type="button" onClick={refresh} disabled={!available || busy}
                        className="px-3 py-2 border border-gray-700 rounded-lg text-gray-300 hover:bg-gray-800 disabled:opacity-50 text-sm">{t('settings.bridge.refresh')}</button>
                </div>
                {!busy && !error && status?.state === 'notInstalled' && <p role="status" className="text-sm text-cyan-400">{t('settings.bridge.installHint')}</p>}
                {!available && <p className="text-sm text-gray-400">{t('settings.messages.electronRequired')}</p>}
                {busy && <div role="status" className="space-y-2 text-cyan-400 text-sm">
                    <p>{t(`settings.bridge.stages.${phase}`)}{phase === 'downloading' && progress?.percent !== undefined ? ` · ${progress.percent}%` : ''}</p>
                    <progress aria-label={t('settings.bridge.working')} className="w-full h-2 accent-cyan-500" max={100}
                        value={phase === 'downloading' ? progress?.percent : undefined} />
                </div>}
                {!busy && !error && result?.success && <div role="status" className="text-sm text-green-400 bg-green-900/20 rounded-lg p-3 space-y-1">
                    <p>{t(result.code === 'UP_TO_DATE' ? 'settings.bridge.upToDate' : 'settings.bridge.success')}</p>
                    {result.restartRequired && <p>{t('settings.bridge.restart')}</p>}
                </div>}
                {error && <div role="alert" className="text-sm text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded-lg p-3 space-y-2">
                    <p>{t(`settings.bridge.errors.${ERROR_CODES.has(error.code) ? error.code : 'INSTALL_FAILED'}`)}</p>
                    {error.message && <p className="text-xs whitespace-pre-wrap break-words select-text text-gray-300">{error.message}</p>}
                </div>}
                {!busy && result?.retainedPath && <p className="text-xs text-gray-400 break-words select-text">{t('settings.bridge.retained')}: {result.retainedPath}</p>}
            </div>
        </section>
    );
};
