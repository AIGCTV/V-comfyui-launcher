import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { Folder, Link, RefreshCw, Loader2 } from 'lucide-react';
import { useTranslation } from '../i18n';

interface SettingsProps {
    settings: AppSettings;
    onSave: (settings: AppSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onSave }) => {
    const { t } = useTranslation();
    const [formData, setFormData] = useState<AppSettings>(settings);
    const [symlinkStatus, setSymlinkStatus] = useState<string>('');

    // Sync formData with settings prop when it changes
    useEffect(() => {
        setFormData(settings);
    }, [settings]);

    // Auto-save when formData changes
    const handleChange = (field: keyof AppSettings, value: string | boolean) => {
        const newSettings = { ...formData, [field]: value };
        setFormData(newSettings);
        onSave(newSettings);
    };

    const handleSelectFile = async (field: 'pythonPath' | 'gitPath') => {
        if (window.electronAPI) {
            const filters = field === 'pythonPath'
                ? [{ name: 'python.exe', extensions: ['exe'] }]
                : [{ name: 'git.exe', extensions: ['exe'] }];

            const path = await window.electronAPI.selectFile(filters);
            if (path) {
                handleChange(field, path);
            }
        } else {
            alert("演示模式无法选择文件");
        }
    };

    const handleSelectDir = async (field: keyof AppSettings) => {
        if (window.electronAPI) {
            const path = await window.electronAPI.selectDirectory();
            if (path) {
                handleChange(field, path);
            }
        } else {
            alert("演示模式无法选择文件夹");
        }
    };

    // PS Plugin Auto-Update State
    const [isUpdatingPlugin, setIsUpdatingPlugin] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<string>('');

    const handlePSPluginUpdate = async () => {
        if (!formData.psPluginPath) {
            setUpdateStatus('⚠️ 请先设置 Photoshop 插件目录');
            setTimeout(() => setUpdateStatus(''), 5000);
            return;
        }

        if (window.electronAPI?.updatePSPlugin) {
            setIsUpdatingPlugin(true);
            setUpdateStatus('正在下载更新...');
            try {
                const result = await window.electronAPI.updatePSPlugin({
                    psPluginPath: formData.psPluginPath
                });

                if (result.success) {
                    setUpdateStatus('✓ 插件更新成功！');
                    setTimeout(() => setUpdateStatus(''), 3000);
                } else {
                    setUpdateStatus('✗ ' + (result.message || '更新失败'));
                    setTimeout(() => setUpdateStatus(''), 5000);
                }
            } catch (error) {
                console.error('[PS Plugin] Update error:', error);
                setUpdateStatus('✗ 更新过程中出现错误');
                setTimeout(() => setUpdateStatus(''), 5000);
            } finally {
                setIsUpdatingPlugin(false);
            }
        } else {
            setUpdateStatus('⚠️ 此功能需要在 Electron 环境中运行');
            setTimeout(() => setUpdateStatus(''), 5000);
        }
    };


    const handleCreateSymlink = async () => {
        if (!formData.modelsPath) {
            alert('请先选择或输入模型目录路径');
            return;
        }

        if (window.electronAPI) {
            try {
                setSymlinkStatus('正在创建映射...');
                const result = await window.electronAPI.createModelSymlink(formData.modelsPath);

                if (result.success) {
                    setSymlinkStatus('✓ ' + result.message);
                    setTimeout(() => setSymlinkStatus(''), 3000);
                } else {
                    setSymlinkStatus('✗ ' + result.message);
                }
            } catch (error: any) {
                setSymlinkStatus('✗ 创建失败: ' + error.message);
            }
        } else {
            alert("演示模式无法创建符号链接");
        }
    };

    // Common card styles
    const cardClass = "flex flex-wrap items-center gap-4 p-4 bg-gray-800/30 rounded-xl border border-gray-700/50";
    const iconWrapperClass = "w-10 h-10 rounded-lg flex items-center justify-center shrink-0";
    const labelWrapperClass = "flex-1 min-w-[180px]";
    const inputWrapperClass = "flex gap-2 w-full sm:w-auto sm:flex-1 min-w-[200px]";

    return (
        <div className="h-full overflow-y-auto scrollbar-default px-4 sm:px-8 py-6 sm:py-8">
            <div className="space-y-8">

                {/* SECTION 1: MODEL SHARING */}
                <section>
                    <div className="flex items-center gap-4 mb-5">
                        <div className="h-7 w-1.5 bg-blue-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            模型共享
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-blue-600/20 text-blue-400`}>
                                <Link size={20} />
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">共享模型目录</div>
                                <div className="text-gray-500 text-xs">将外部模型目录映射到 ComfyUI，多实例共享</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <input
                                    type="text"
                                    value={formData.modelsPath || ''}
                                    onChange={(e) => handleChange('modelsPath', e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder=""
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateSymlink}
                                    disabled={!formData.modelsPath}
                                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg flex items-center gap-1.5 transition-all whitespace-nowrap"
                                    title="更新映射"
                                >
                                    <Link size={14} />
                                    映射
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSelectDir('modelsPath')}
                                    className="px-2.5 bg-gray-700 rounded-lg text-gray-300 border border-gray-600 hover:bg-gray-600"
                                >
                                    <Folder size={16} />
                                </button>
                            </div>
                        </div>
                        {symlinkStatus && (
                            <div className={`text-sm pl-2 ${symlinkStatus.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
                                {symlinkStatus}
                            </div>
                        )}
                    </div>
                </section>

                {/* SECTION 2: LAUNCH ARGS */}
                <section>
                    <div className="flex items-center gap-4 mb-5">
                        <div className="h-7 w-1.5 bg-green-500 rounded-full shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            启动参数
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-green-600/20 text-green-400 font-mono text-sm font-bold`}>
                                &gt;_
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">自定义参数</div>
                                <div className="text-gray-500 text-xs">多个参数用空格分隔，例如: --listen --port 8189</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <input
                                    type="text"
                                    value={formData.customArgs}
                                    onChange={(e) => handleChange('customArgs', e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-500 font-mono text-sm"
                                    placeholder="--lowvram --preview-method auto"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* SECTION 3: ENVIRONMENT SETTINGS */}
                <section>
                    <div className="flex items-center gap-4 mb-5">
                        <div className="h-7 w-1.5 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            环境设置
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        {/* Python Path Override */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-blue-600/20 text-blue-400 font-mono text-sm font-bold`}>
                                PY
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">Python 路径覆盖</div>
                                <div className="text-gray-500 text-xs">留空则使用便携包内置 Python 解释器</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <input
                                    type="text"
                                    value={formData.pythonPath}
                                    onChange={(e) => handleChange('pythonPath', e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder=""
                                />
                                <button
                                    type="button"
                                    onClick={() => handleSelectFile('pythonPath')}
                                    className="px-2.5 bg-gray-700 rounded-lg text-gray-300 border border-gray-600 hover:bg-gray-600"
                                >
                                    <Folder size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Git Path Override */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-orange-600/20 text-orange-400`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="18" cy="18" r="3" />
                                    <circle cx="6" cy="6" r="3" />
                                    <path d="M6 21V9a9 9 0 0 0 9 9" />
                                </svg>
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">Git 路径覆盖</div>
                                <div className="text-gray-500 text-xs">留空则使用便携包内置 Git 版本管理器</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <input
                                    type="text"
                                    value={formData.gitPath}
                                    onChange={(e) => handleChange('gitPath', e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder=""
                                />
                                <button
                                    type="button"
                                    onClick={() => handleSelectFile('gitPath')}
                                    className="px-2.5 bg-gray-700 rounded-lg text-gray-300 border border-gray-600 hover:bg-gray-600"
                                >
                                    <Folder size={16} />
                                </button>
                            </div>
                        </div>

                        {/* GitHub Proxy */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-green-600/20 text-green-400`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                </svg>
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">使用 GitHub 代理加速</div>
                                <div className="text-gray-500 text-xs">通过 ghproxy.com 加速版本切换和更新</div>
                            </div>
                            <div className="ml-auto">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.useGitHubProxy || false}
                                        onChange={(e) => handleChange('useGitHubProxy', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600"></div>
                                </label>
                            </div>
                        </div>
                    </div>
                </section>

                {/* SECTION 4: PS PLUGIN SETTINGS */}
                <section>
                    <div className="flex items-center gap-4 mb-5">
                        <div className="h-7 w-1.5 bg-cyan-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            PS插件设置
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        {/* Photoshop Plugin Path */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-cyan-600/20 text-cyan-400`}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                                </svg>
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">Photoshop 插件目录</div>
                                <div className="text-gray-500 text-xs">选择PS插件目录Plug-ins，后续点旋转按钮可一键更新</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <input
                                    type="text"
                                    value={formData.psPluginPath || ''}
                                    onChange={(e) => handleChange('psPluginPath', e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-500 text-sm"
                                    placeholder=""
                                    disabled={false}
                                />
                                <button
                                    type="button"
                                    onClick={handlePSPluginUpdate}
                                    disabled={isUpdatingPlugin}
                                    className="px-2.5 bg-blue-600 rounded-lg text-white border border-blue-500 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="自动更新插件"
                                >
                                    {isUpdatingPlugin ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleSelectDir('psPluginPath')}
                                    className="px-2.5 bg-gray-700 rounded-lg text-gray-300 border border-gray-600 hover:bg-gray-600"
                                >
                                    <Folder size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Update Status */}
                        {updateStatus && (
                            <div className="text-sm text-center text-cyan-400 bg-cyan-900/20 rounded-lg py-2 px-4 border border-cyan-700/50">
                                {updateStatus}
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};
