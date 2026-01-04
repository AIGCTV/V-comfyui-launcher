import React, { useState, useEffect, useCallback } from 'react';
import { Eye, EyeOff, FolderOpen, Copy, Check, AlertCircle, Loader2, RefreshCw, X, Search, Zap, CreditCard } from 'lucide-react';
import { RunningHubConfig } from '../types';
import { useTranslation } from '../i18n';

export const RunningHub: React.FC = () => {
    const { t } = useTranslation();
    const [apiKey, setApiKey] = useState('');
    const [webappId, setWebappId] = useState('');
    const [showApiKey, setShowApiKey] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info' | null; message: string }>({ type: null, message: '' });
    const [savedPath, setSavedPath] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Account info state - don't load from cache on init, require fresh fetch
    // This ensures account info matches current apiKey
    const [accountInfo, setAccountInfo] = useState<{ remainCoins: string; remainMoney: string; currency: string } | null>(null);
    const [accountLoading, setAccountLoading] = useState(false);

    // Task status state - load from localStorage on init
    const [taskId, setTaskId] = useState(() => localStorage.getItem('rh_task_id') || '');
    const [taskStatus, setTaskStatus] = useState<{ status: 'idle' | 'running' | 'success' | 'error'; message: string; code?: number }>(() => {
        const saved = localStorage.getItem('rh_task_status');
        return saved ? JSON.parse(saved) : { status: 'idle', message: '' };
    });
    const [taskLoading, setTaskLoading] = useState(false);
    const [startTime, setStartTime] = useState<number | null>(() => {
        const saved = localStorage.getItem('rh_start_time');
        return saved ? parseInt(saved) : null;
    });
    const startTimeRef = React.useRef<number | null>(
        localStorage.getItem('rh_start_time') ? parseInt(localStorage.getItem('rh_start_time')!) : null
    );

    // Removed manual monitoring toggle - now auto-tracks via task ID polling


    // Ref for apiKey to avoid closure issues
    const apiKeyRef = React.useRef(apiKey);
    React.useEffect(() => { apiKeyRef.current = apiKey; }, [apiKey]);

    // Persist taskStatus to localStorage
    React.useEffect(() => {
        localStorage.setItem('rh_task_status', JSON.stringify(taskStatus));
    }, [taskStatus]);

    // Persist startTime to localStorage
    React.useEffect(() => {
        if (startTime !== null) {
            localStorage.setItem('rh_start_time', startTime.toString());
        } else {
            localStorage.removeItem('rh_start_time');
        }
    }, [startTime]);

    // Save config function with useCallback to prevent infinite loops
    const saveConfig = useCallback(async () => {
        if (window.electronAPI?.saveRHConfig && (apiKey || webappId)) {
            await window.electronAPI.saveRHConfig({
                apiKey,
                webappId,
                baseUrl: 'https://www.runninghub.cn'
            });
            console.log('[RunningHub] Config saved:', { apiKey: apiKey ? '***' : '', webappId });
        }
    }, [apiKey, webappId]);

    // Load saved config on mount
    useEffect(() => {
        const loadConfig = async () => {
            if (window.electronAPI?.loadRHConfig) {
                const config = await window.electronAPI.loadRHConfig();
                if (config) {
                    console.log('[RunningHub] Config loaded:', { apiKey: config.apiKey ? '***' : '', webappId: config.webappId });
                    setApiKey(config.apiKey || '');
                    setWebappId(config.webappId || '');

                    // Auto-fetch account info if apiKey exists
                    if (config.apiKey?.trim()) {
                        try {
                            setAccountLoading(true);
                            const result = await window.electronAPI?.getRHAccountStatus(config.apiKey.trim());
                            if (result?.success && result.data) {
                                setAccountInfo({
                                    remainCoins: result.data.remainCoins,
                                    remainMoney: result.data.remainMoney,
                                    currency: result.data.currency
                                });
                            }
                        } catch (e) {
                            console.error('[RunningHub] Failed to fetch account info on load:', e);
                        } finally {
                            setAccountLoading(false);
                        }
                    }
                }
            }
        };
        loadConfig();

        // Check if saved task status needs to be reset
        // If status is success or error, schedule reset to idle
        const savedStatus = localStorage.getItem('rh_task_status');
        if (savedStatus) {
            try {
                const parsed = JSON.parse(savedStatus);
                if (parsed.status === 'success' || parsed.status === 'error') {
                    // Reset immediately if page was refreshed with completed status
                    setTaskStatus({ status: 'idle', message: '' });
                    localStorage.removeItem('rh_task_status');
                    localStorage.removeItem('rh_task_id');
                    setTaskId('');
                }
            } catch (e) {
                // Invalid JSON, clear it
                localStorage.removeItem('rh_task_status');
            }
        }
    }, []);

    // Auto-save config when apiKey or webappId changes (with debouncing)
    useEffect(() => {
        const timer = setTimeout(() => {
            saveConfig();
        }, 1000); // 1 second debounce

        return () => clearTimeout(timer);
    }, [saveConfig]);

    // Clear account info cache when apiKey changes
    // Also store the apiKey hash to detect changes
    const prevApiKeyRef = React.useRef<string>('');
    useEffect(() => {
        const currentApiKey = apiKey.trim();
        const prevApiKey = prevApiKeyRef.current;

        // If apiKey changed (and not initial load)
        if (prevApiKey !== '' && prevApiKey !== currentApiKey) {
            // Clear cached account info
            setAccountInfo(null);
            localStorage.removeItem('rh_account_info');
            localStorage.removeItem('rh_cached_apikey');
            console.log('[RunningHub] API Key changed, cleared account cache');
        }

        // Update ref
        prevApiKeyRef.current = currentApiKey;

        // Store current apiKey hash for cache validation
        if (currentApiKey) {
            localStorage.setItem('rh_cached_apikey', currentApiKey.substring(0, 8));
        }
    }, [apiKey]);

    // Listen for taskId auto-detection from ComfyUI logs
    useEffect(() => {
        const handleTaskDetected = (_event: any, detectedTaskId: string) => {
            console.log('[RunningHub] TaskId detected:', detectedTaskId);
            // Clear any pending reset timer when new task starts
            if (resetTimerRef.current) {
                clearTimeout(resetTimerRef.current);
                resetTimerRef.current = null;
            }
            handleTaskIdChange(detectedTaskId);
            setTaskStatus({ status: 'running', message: '运行中...' });
            const now = Date.now();
            setStartTime(now);
            startTimeRef.current = now;
            // Start auto-polling
            startPolling(detectedTaskId);
        };

        window.electronAPI?.onRHTaskDetected(handleTaskDetected);
        return () => {
            window.electronAPI?.removeRHTaskListener(handleTaskDetected);
        };
    }, [apiKey]);

    // Polling interval reference
    const pollingRef = React.useRef<NodeJS.Timeout | null>(null);

    // Reset timer reference - for auto-reset to idle after 10 seconds
    const resetTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    // Clear reset timer
    const clearResetTimer = () => {
        if (resetTimerRef.current) {
            clearTimeout(resetTimerRef.current);
            resetTimerRef.current = null;
        }
    };

    // Schedule reset to idle after 30 seconds
    const scheduleReset = () => {
        clearResetTimer();
        resetTimerRef.current = setTimeout(() => {
            setTaskStatus({ status: 'idle', message: '' });
            localStorage.removeItem('rh_task_status');
            localStorage.removeItem('rh_task_id');
            setTaskId('');
        }, 30000); // 30 seconds
    };

    // Start polling for task status
    const startPolling = (pollTaskId: string) => {
        // Clear any existing polling
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
        }

        // Poll every 3 seconds
        pollingRef.current = setInterval(async () => {
            const currentApiKey = apiKeyRef.current;
            if (!currentApiKey.trim()) return;

            try {
                const result = await window.electronAPI?.getRHTaskStatus(currentApiKey.trim(), pollTaskId);
                console.log('[RunningHub] Poll result:', result);

                if (result?.success) {
                    const code = result.code;
                    const msg = result.msg || '';
                    const data = result.data;

                    // CORRECT STATUS LOGIC V2:
                    // Priority 1: Check data string value (RUNNING, SUCCESS, QUEUED, FAILED)
                    // Priority 2: Check code/msg if data is object or null

                    let statusFromData = '';
                    if (data && typeof data === 'string') {
                        statusFromData = data.toUpperCase();
                    }

                    // Calculate elapsed time - use ref to avoid closure issue
                    const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;

                    console.log('[RunningHub] Poll debug:', { code, msg, data, statusFromData, elapsed });

                    // 1. SUCCESS - Strict Check
                    // MUST be explicitly "SUCCESS" in data, or "success" in msg AND code 0 AND data is NOT "RUNNING"/"QUEUED"
                    const isSuccess = statusFromData === 'SUCCESS' ||
                        (statusFromData === 'COMPLETED') ||
                        (code === 0 && (msg === 'success' || msg === 'SUCCESS') && statusFromData !== 'RUNNING' && statusFromData !== 'QUEUED');

                    if (isSuccess) {
                        // Call outputs API to get official taskCostTime
                        let displayTime = elapsed;
                        try {
                            const outputsResult = await window.electronAPI?.getRHTaskOutputs(currentApiKey.trim(), pollTaskId);
                            console.log('[RunningHub] Outputs API result:', outputsResult);
                            if (outputsResult?.success && outputsResult.data && Array.isArray(outputsResult.data) && outputsResult.data.length > 0) {
                                const costTime = outputsResult.data[0].taskCostTime;
                                if (costTime) {
                                    displayTime = parseInt(costTime) || elapsed;
                                }
                            }
                        } catch (err) {
                            console.error('[RunningHub] Failed to get outputs:', err);
                        }
                        setTaskStatus({ status: 'success', message: `任务完成! 用时: ${displayTime}秒`, code: 0 });
                        stopPolling();
                        scheduleReset(); // Auto reset to idle after 10 seconds
                        fetchAccountInfo();
                        setStartTime(null);
                        startTimeRef.current = null;
                        return;
                    }

                    // 2. QUEUED - STRICT: Only code 813 means queued
                    if (code === 813) {
                        setTaskStatus({ status: 'running', message: `排队中...`, code: 813 });
                        return;
                    }

                    // 3. RUNNING
                    // Include code 0 if data is "RUNNING"
                    if (statusFromData === 'RUNNING' || code === 804 || (msg && msg.toUpperCase().includes('RUNNING'))) {
                        setTaskStatus({ status: 'running', message: `运行中...`, code: code || 804 });
                        return;
                    }

                    // 4. ERROR
                    if (statusFromData === 'FAILED' || code === 805 || (code !== undefined && code !== 0 && code !== 804 && code !== 813)) {
                        const errorMsg = msg || '未知错误';
                        setTaskStatus({ status: 'error', message: `任务失败: ${errorMsg} (Code: ${code})`, code });
                        stopPolling();
                        scheduleReset(); // Auto reset to idle after 10 seconds
                        setStartTime(null);
                        startTimeRef.current = null;
                        return;
                    }

                    // 5. Fallback - treat ambiguous code 0 as running to be safe
                    setTaskStatus({ status: 'running', message: `运行中...`, code: code || 0 });
                }
            } catch (error: any) {
                console.error('[RunningHub] Polling error:', error);
            }
        }, 3000);
    };

    // Stop polling
    const stopPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopPolling();
            clearResetTimer();
        };
    }, []);

    const handleGenerate = async () => {
        // Validation
        if (!apiKey.trim()) {
            setStatus({ type: 'error', message: 'API Key 不能为空!' });
            return;
        }
        if (!webappId.trim()) {
            setStatus({ type: 'error', message: 'Workflow ID 不能为空!' });
            return;
        }

        setIsLoading(true);
        setStatus({ type: 'info', message: '正在生成工作流...' });
        setSavedPath(null);

        try {
            // Save config first
            await saveConfig();

            if (window.electronAPI?.generateRHWorkflow) {
                const config: RunningHubConfig = {
                    apiKey: apiKey.trim(),
                    webappId: webappId.trim(),
                    baseUrl: 'https://www.runninghub.cn'
                };

                const result = await window.electronAPI.generateRHWorkflow(config);

                if (result.success) {
                    setStatus({ type: 'success', message: result.message });
                    if (result.savedPath) {
                        setSavedPath(result.savedPath);
                    }
                } else {
                    setStatus({ type: 'error', message: result.message });
                }
            } else {
                setStatus({ type: 'error', message: '此功能需要在 Electron 环境中运行' });
            }
        } catch (error: any) {
            setStatus({ type: 'error', message: `生成失败: ${error.message}` });
        } finally {
            setIsLoading(false);
        }
    };

    const handleOpenFolder = () => {
        if (window.electronAPI?.openDirectory) {
            // Use same path format as Dashboard component
            window.electronAPI.openDirectory('ComfyUI\\user\\default\\workflows');
        }
    };

    const handleCopyPath = () => {
        if (savedPath) {
            navigator.clipboard.writeText(savedPath);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };


    // Fetch account info (coins, wallet)
    const fetchAccountInfo = async () => {
        if (!apiKey.trim()) {
            setStatus({ type: 'error', message: '请先输入 API Key' });
            return;
        }
        setAccountLoading(true);
        try {
            const result = await window.electronAPI?.getRHAccountStatus(apiKey.trim());
            if (result?.success && result.data) {
                const info = {
                    remainCoins: result.data.remainCoins,
                    remainMoney: result.data.remainMoney,
                    currency: result.data.currency
                };
                setAccountInfo(info);
                localStorage.setItem('rh_account_info', JSON.stringify(info));
            } else {
                setStatus({ type: 'error', message: result?.message || '获取账户信息失败' });
            }
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setAccountLoading(false);
        }
    };

    // Save taskId to localStorage when it changes
    const handleTaskIdChange = (value: string) => {
        setTaskId(value);
        localStorage.setItem('rh_task_id', value);
    };

    // Query task status
    const queryTaskStatus = async () => {
        if (!apiKey.trim() || !taskId.trim()) {
            setStatus({ type: 'error', message: '请输入 API Key 和 Task ID' });
            return;
        }
        setTaskLoading(true);
        try {
            const result = await window.electronAPI?.getRHTaskStatus(apiKey.trim(), taskId.trim());
            if (result?.success) {
                const code = result.code;
                const msg = result.msg || '';
                // Check if running: code in 8xx range OR msg contains RUNNING
                const isRunning = (code !== undefined && code >= 800 && code < 900) ||
                    msg.toUpperCase().includes('RUNNING');
                if (isRunning) {
                    setTaskStatus({ status: 'running', message: '任务运行中...', code: code || 800 });
                } else if (code === 0) {
                    setTaskStatus({ status: 'success', message: msg || '任务完成', code });
                } else {
                    setTaskStatus({ status: 'error', message: msg || '任务失败', code });
                }
            } else {
                setTaskStatus({ status: 'error', message: result?.message || '查询失败' });
            }
        } catch (error: any) {
            setTaskStatus({ status: 'error', message: error.message });
        } finally {
            setTaskLoading(false);
        }
    };

    // Cancel task
    const cancelTask = async () => {
        if (!apiKey.trim() || !taskId.trim()) {
            setStatus({ type: 'error', message: '请输入 API Key 和 Task ID' });
            return;
        }
        setTaskLoading(true);
        try {
            stopPolling(); // Stop polling immediately
            const result = await window.electronAPI?.cancelRHTask(apiKey.trim(), taskId.trim());
            if (result?.success) {
                setTaskStatus({ status: 'error', message: '已取消', code: -1 });
                setStatus({ type: 'success', message: '任务已取消' });
                // Refresh account balance after cancel
                fetchAccountInfo();
            } else {
                setStatus({ type: 'error', message: result?.message || '取消失败' });
            }
        } catch (error: any) {
            setStatus({ type: 'error', message: error.message });
        } finally {
            setTaskLoading(false);
        }
    };

    return (
        <div className="h-full overflow-y-auto scrollbar-default px-8 py-8">
            <div className="space-y-8">

                {/* Header */}
                <div className="flex items-center gap-4">
                    <div className="h-10 w-1.5 bg-cyan-500 rounded-full shadow-[0_0_12px_rgba(6,182,212,0.5)]"></div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-wide flex items-center gap-3">
                            <Zap className="text-cyan-400" size={28} />
                            RunningHub-PS 插件一键生成器
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">
                            通过Runninghub应用ID自动生成PS AI插件
                        </p>
                    </div>
                </div>

                {/* Account & Task Status Section - Single Row */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                        {/* Left: Account Info + Task Status */}
                        <div className="flex items-center gap-6">
                            {/* Account Info */}
                            <div className="flex items-center gap-2">
                                <CreditCard size={16} className="text-gray-400" />
                                <span className="text-sm text-gray-300 font-semibold">账户信息</span>
                                {apiKey.trim() && accountInfo && (
                                    <>
                                        <span className="text-sm text-gray-400">RH币: <span className="text-yellow-400 font-bold">{accountInfo.remainCoins}</span></span>
                                        <span className="text-sm text-gray-400">余额: <span className="text-green-400 font-bold">{accountInfo.currency === 'CNY' ? '¥' : '$'}{accountInfo.remainMoney}</span></span>
                                    </>
                                )}
                                {!apiKey.trim() && (
                                    <span className="text-xs text-gray-500">请先输入API Key</span>
                                )}
                            </div>

                            {/* Separator */}
                            <div className="w-px h-5 bg-gray-600"></div>

                            {/* Task Status */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-300 font-semibold">任务状态</span>
                                {taskStatus.status !== 'idle' && (
                                    <>
                                        <span className={`w - 2.5 h - 2.5 rounded - full ${taskStatus.status === 'running' ? 'bg-yellow-400 animate-pulse' :
                                            taskStatus.status === 'success' ? 'bg-green-400' : 'bg-red-400'
                                            } `}></span>
                                        <span className={`text - xs ${taskStatus.status === 'running' ? 'text-yellow-400' :
                                            taskStatus.status === 'success' ? 'text-green-400' : 'text-red-400'
                                            } `}>{taskStatus.message}</span>
                                    </>
                                )}
                                {taskStatus.status === 'idle' && (
                                    <span className="text-xs text-gray-500">等待任务...</span>
                                )}
                            </div>
                        </div>

                        {/* Right: Buttons */}
                        <div className="flex items-center gap-2">
                            {/* Monitoring is now automatic - no manual toggle needed */}
                            {/* Cancel Task Button - Always visible when taskId exists */}
                            {taskId && (
                                <button
                                    onClick={cancelTask}
                                    disabled={taskLoading}
                                    className="px-2 py-1 bg-red-600/60 hover:bg-red-500 disabled:opacity-50 rounded text-xs font-medium flex items-center gap-1"
                                >
                                    <X size={12} />
                                    取消任务
                                </button>
                            )}
                            {/* Refresh Account Button */}
                            <button
                                onClick={fetchAccountInfo}
                                disabled={accountLoading || !apiKey}
                                className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1 disabled:opacity-50"
                            >
                                {accountLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                刷新
                            </button>
                        </div>
                    </div>
                </div>

                {/* Config Form */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6 space-y-5">
                    <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                        <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
                        配置信息
                    </h3>

                    {/* API Key */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">API Key</label>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 pr-12 text-gray-200 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                                    placeholder="输入您的 RunningHub API Key"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                >
                                    {showApiKey ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500">在 RunningHub 个人中心获取您的 API Key</p>
                    </div>

                    {/* Webapp ID */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-400">Workflow ID (webappId)</label>
                        <input
                            type="text"
                            value={webappId}
                            onChange={(e) => setWebappId(e.target.value)}
                            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-4 py-2.5 text-gray-200 focus:outline-none focus:border-cyan-500 font-mono text-sm"
                            placeholder="例如: 1982647023562309634"
                        />
                        <p className="text-xs text-gray-500">工作流的唯一标识符,可在 RunningHub 工作流详情页获取</p>
                    </div>

                    {/* Generate Button */}
                    <div className="pt-2">
                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    生成中...
                                </>
                            ) : (
                                <>
                                    <Zap size={20} />
                                    生成工作流
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Status Display */}
                {status.type && (
                    <div className={`rounded - xl p - 4 flex items - start gap - 3 ${status.type === 'success' ? 'bg-green-900/20 border border-green-700/50' :
                        status.type === 'error' ? 'bg-red-900/20 border border-red-700/50' :
                            'bg-blue-900/20 border border-blue-700/50'
                        } `}>
                        {status.type === 'success' ? (
                            <Check className="text-green-400 shrink-0 mt-0.5" size={20} />
                        ) : status.type === 'error' ? (
                            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={20} />
                        ) : (
                            <Loader2 className="text-blue-400 shrink-0 mt-0.5 animate-spin" size={20} />
                        )}
                        <div className="flex-1">
                            <p className={`font - medium ${status.type === 'success' ? 'text-green-400' :
                                status.type === 'error' ? 'text-red-400' :
                                    'text-blue-400'
                                } `}>
                                {status.type === 'success' ? '成功' : status.type === 'error' ? '错误' : '处理中'}
                            </p>
                            <p className={`text - sm mt - 1 ${status.type === 'success' ? 'text-green-200/80' :
                                status.type === 'error' ? 'text-red-200/80' :
                                    'text-blue-200/80'
                                } `}>
                                {status.message}
                            </p>

                            {/* Saved Path Actions */}
                            {savedPath && status.type === 'success' && (
                                <div className="mt-3 space-y-2">
                                    <code className="text-xs bg-gray-900/50 px-2 py-1 rounded text-gray-300 block break-all">
                                        {savedPath}
                                    </code>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleOpenFolder}
                                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 flex items-center gap-1"
                                        >
                                            <FolderOpen size={14} />
                                            打开文件夹
                                        </button>
                                        <button
                                            onClick={handleCopyPath}
                                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded-lg text-xs text-gray-300 flex items-center gap-1"
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                            {copied ? '已复制' : '复制路径'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}


                {/* Usage Tips */}
                <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-5">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">使用提示</h3>
                    <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400 mt-1">•</span>
                            生成的工作流将保存到 ComfyUI 的 workflows 目录中
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400 mt-1">•</span>
                            请确保已安装 comfyui-photoshop、ComfyUI_RH_APICall、rgthree-comfy等必备插件
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-cyan-400 mt-1">•</span>
                            API Key 会保存在本地配置中,请妥善保管
                        </li>
                    </ul>
                </div>

            </div>
        </div>
    );
};
