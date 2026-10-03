import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';
import { Folder, Link } from 'lucide-react';
import { useTranslation } from '../i18n';
import { PSBridgeSettings } from './PSBridgeSettings';

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
            alert(t('settings.messages.demoSelectFile'));
        }
    };

    const handleSelectDir = async (field: keyof AppSettings) => {
        if (window.electronAPI) {
            const path = await window.electronAPI.selectDirectory();
            if (path) {
                handleChange(field, path);
            }
        } else {
            alert(t('settings.messages.demoSelectDir'));
        }
    };

    const handleCreateSymlink = async () => {
        if (!formData.modelsPath) {
            alert(t('settings.messages.selectModelDirFirst'));
            return;
        }

        if (window.electronAPI) {
            try {
                setSymlinkStatus(t('settings.messages.creatingSymlink'));
                const result = await window.electronAPI.createModelSymlink(formData.modelsPath);

                if (result.success) {
                    setSymlinkStatus('✓ ' + t(result.message));
                    setTimeout(() => setSymlinkStatus(''), 3000);
                } else {
                    const extraInfo = result.error ? (' ' + result.error) : '';
                    setSymlinkStatus('✗ ' + t(result.message) + extraInfo);
                }
            } catch (error: any) {
                setSymlinkStatus(t('settings.messages.createSymlinkFailed') + error.message);
            }
        } else {
            alert(t('settings.messages.demoCreateSymlink'));
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
                            {t('settings.modelSharing')}
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-blue-600/20 text-blue-400`}>
                                <Link size={20} />
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">{t('settings.shareModelDir')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.shareModelDesc')}</div>
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
                                    title={t('settings.symlink')}
                                >
                                    <Link size={14} />
                                    {t('settings.symlink')}
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
                            {t('settings.launchArgs')}
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-green-600/20 text-green-400 font-mono text-sm font-bold`}>
                                &gt;_
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">{t('settings.customArgs')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.customArgsDesc')}</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <input
                                    type="text"
                                    value={formData.customArgs}
                                    onChange={(e) => handleChange('customArgs', e.target.value)}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-500 font-mono text-sm"
                                    placeholder={t('settings.customArgsDesc')}
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
                            {t('settings.envSettings')}
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
                                <div className="text-white font-medium text-sm">{t('settings.pythonPath')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.pythonPathDesc')}</div>
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
                                <div className="text-white font-medium text-sm">{t('settings.gitPathOverride')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.gitPathDesc')}</div>
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

                        {/* Old GitHub Proxy - Moved to Network Settings */}
                    </div>
                </section>



                {/* SECTION 4: NETWORK SETTINGS */}
                <section>
                    <div className="flex items-center gap-4 mb-5">
                        <div className="h-7 w-1.5 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
                        <h1 className="text-xl font-bold text-white tracking-wide">
                            {t('settings.networkSettings')}
                        </h1>
                        <div className="h-px bg-gray-800 flex-1 ml-4" />
                    </div>

                    <div className="space-y-4 pl-1">
                        {/* Git Mirror */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-indigo-600/20 text-indigo-400`}>
                                <div className="font-bold text-xs">GIT</div>
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">{t('settings.gitMirror')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.gitMirrorDesc')}</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <div className={`flex-1 px-3 py-2 text-sm font-mono ${formData.useGithubMirror ? 'text-green-400' : 'text-gray-500'}`}>
                                    {formData.useGithubMirror ? 'https://ghproxy.net/' : '直连模式 (由网络环境决定)'}
                                </div>
                            </div>
                            <div className="ml-auto">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.useGithubMirror || false}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            const newSettings = {
                                                ...formData,
                                                useGithubMirror: checked,
                                                useGitHubProxy: checked,
                                                githubMirrorUrl: 'https://ghproxy.net/'
                                            };
                                            setFormData(newSettings);
                                            onSave(newSettings);
                                        }}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:!bg-blue-600 peer-checked:border-blue-600"></div>
                                </label>
                            </div>
                        </div>

                        {/* PyPI Mirror */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-blue-600/20 text-blue-400`}>
                                <div className="font-bold text-xs">PIP</div>
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">{t('settings.pypiMirror')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.pypiMirrorDesc')}</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <div className="flex-1 flex items-center bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                                    <select
                                        value={['https://pypi.tuna.tsinghua.edu.cn/simple', 'https://mirrors.aliyun.com/pypi/simple/', 'https://mirrors.cloud.tencent.com/pypi/simple', 'https://repo.huaweicloud.com/repository/pypi/simple'].includes(formData.pypiMirrorUrl || 'https://pypi.tuna.tsinghua.edu.cn/simple') ? (formData.pypiMirrorUrl || 'https://pypi.tuna.tsinghua.edu.cn/simple') : 'https://pypi.tuna.tsinghua.edu.cn/simple'}
                                        onChange={(e) => {
                                            handleChange('pypiMirrorUrl', e.target.value);
                                        }}
                                        disabled={!formData.usePypiMirror}
                                        className={`flex-1 bg-gray-900 border-none px-3 py-2 text-gray-200 text-sm focus:ring-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                                        style={{ backgroundColor: '#111827', color: '#e5e7eb' }}
                                    >
                                        <option value="https://pypi.tuna.tsinghua.edu.cn/simple" className="bg-gray-900 text-gray-200">清华大学 (https://pypi.tuna.tsinghua.edu.cn/simple)</option>
                                        <option value="https://mirrors.aliyun.com/pypi/simple/" className="bg-gray-900 text-gray-200">阿里云 (https://mirrors.aliyun.com/pypi/simple/)</option>
                                        <option value="https://mirrors.cloud.tencent.com/pypi/simple" className="bg-gray-900 text-gray-200">腾讯云 (https://mirrors.cloud.tencent.com/pypi/simple)</option>
                                        <option value="https://repo.huaweicloud.com/repository/pypi/simple" className="bg-gray-900 text-gray-200">华为云 (https://repo.huaweicloud.com/repository/pypi/simple)</option>
                                    </select>
                                </div>
                            </div>
                            <div className="ml-auto">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.usePypiMirror || false}
                                        onChange={(e) => handleChange('usePypiMirror', e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:!bg-blue-600 peer-checked:border-blue-600"></div>
                                </label>
                            </div>
                        </div>

                        {/* HuggingFace Mirror */}
                        <div className={cardClass}>
                            <div className={`${iconWrapperClass} bg-yellow-600/20 text-yellow-400`}>
                                <div className="font-bold text-xs">HF</div>
                            </div>
                            <div className={labelWrapperClass}>
                                <div className="text-white font-medium text-sm">{t('settings.hfMirror')}</div>
                                <div className="text-gray-500 text-xs">{t('settings.hfMirrorDesc')}</div>
                            </div>
                            <div className={inputWrapperClass}>
                                <div className={`flex-1 px-3 py-2 text-sm font-mono ${formData.useHfMirror ? 'text-green-400' : 'text-gray-500'}`}>
                                    {formData.useHfMirror ? 'https://hf-mirror.com' : '直连模式 (由网络环境决定)'}
                                </div>
                            </div>
                            <div className="ml-auto">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={formData.useHfMirror || false}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            const newSettings = {
                                                ...formData,
                                                useHfMirror: checked,
                                                hfMirrorUrl: 'https://hf-mirror.com'
                                            };
                                            setFormData(newSettings);
                                            onSave(newSettings);
                                        }}
                                        className="sr-only peer"
                                    />
                                    <div className="w-10 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:!bg-blue-600 peer-checked:border-blue-600"></div>
                                </label>
                            </div>
                        </div>
                    </div>
                </section>

                <PSBridgeSettings settings={formData} />
            </div>


        </div >
    );
};
