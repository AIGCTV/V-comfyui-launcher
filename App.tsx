import React, { useState, useCallback, useEffect } from 'react';
import { Play, Terminal, Layers, Settings as SettingsIcon, BookOpen, Sparkles, Sun, Moon, Globe } from 'lucide-react';
import { useTheme } from './ThemeContext';
import { useTranslation } from './i18n';
import { Dashboard } from './components/Dashboard';
import { Versions } from './components/Versions';
import { Settings } from './components/Settings';
import { About } from './components/About';
import { Console } from './components/Console';
import { RunningHub } from './components/RunningHub';
import { AppStatus, RunMode, LogEntry, AppSettings, TabView, VersionInfo } from './types';

// Default settings - empty paths mean use portable environment
const DEFAULT_SETTINGS: AppSettings = {
  pythonPath: '',  // Empty = use portable python
  gitPath: '',     // Empty = use portable git
  customArgs: '',
  useGitHubProxy: false,
  psPluginPath: '',  // Empty = default path
  // Network Defaults matching main.cjs
  useGithubMirror: false,
  githubMirrorUrl: 'https://ghproxy.net/',
  usePypiMirror: false,
  pypiMirrorUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple',
  useHfMirror: false,
  hfMirrorUrl: 'https://hf-mirror.com'
};

const App: React.FC = () => {
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState<TabView>('dashboard');
  const [status, setStatus] = useState<AppStatus>(AppStatus.STOPPED);
  const [mode, setMode] = useState<RunMode>(RunMode.GPU);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // State for version management
  const [currentVersionId, setCurrentVersionId] = useState<string>("Unknown");
  const [isUpdating, setIsUpdating] = useState(false);

  // ComfyUI Local Version Info
  const [localComfyVersion, setLocalComfyVersion] = useState<{ hash: string, fullHash: string, date: string }>({ hash: 'Loading...', fullHash: '', date: '' });

  // Launcher Version Info
  const [launcherVersion, setLauncherVersion] = useState<{ version: string; buildDate: string }>({ version: '1.1.0', buildDate: '2026-6-5 10:13:14' });

  const addLog = useCallback((message: string, type: 'info' | 'error' | 'system' = 'info') => {
    setLogs(prev => [...prev, {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      message,
      type
    }]);
  }, []);

  // Load settings on startup
  useEffect(() => {
    const loadConfig = async () => {
      if (window.electronAPI) {
        const savedSettings = await window.electronAPI.loadSettings();
        if (savedSettings) {
          console.log('Loaded settings:', savedSettings);
          setSettings(prev => ({ ...prev, ...savedSettings }));
        }
      }
    };
    loadConfig();
  }, []);

  // Fetch local version on startup
  useEffect(() => {
    const fetchLocalInfo = async () => {
      if (window.electronAPI) {
        try {
          console.log('[Version Detection] Starting...');
          // Get Short Hash
          const hash = await window.electronAPI.gitCommand('rev-parse --short HEAD', settings);
          // Get Full Hash
          const fullHash = await window.electronAPI.gitCommand('rev-parse HEAD', settings);
          // Get Date in ISO format
          const dateRaw = await window.electronAPI.gitCommand('log -1 --format=%ci', settings);

          const trimmedHash = hash.trim();
          const trimmedFullHash = fullHash.trim();
          let trimmedDate = dateRaw.trim();

          // Convert ISO date to zh-CN format to match list
          if (trimmedDate) {
            try {
              const date = new Date(trimmedDate);
              trimmedDate = date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
            } catch (e) {
              console.error('Date parsing error:', e);
            }
          }

          if (trimmedHash && trimmedHash !== '') {
            setLocalComfyVersion({
              hash: trimmedHash,
              fullHash: trimmedFullHash,
              date: trimmedDate || ''
            });
            setCurrentVersionId(trimmedHash);
            console.log('[Version Detection] Success! Version:', trimmedHash, 'Full:', trimmedFullHash);
          } else {
            setLocalComfyVersion({ hash: 'Unknown', fullHash: '', date: '' });
            setCurrentVersionId('Unknown');
          }
        } catch (e: any) {
          console.error("[Version Detection] Error:", e);
          setLocalComfyVersion({ hash: 'Error', fullHash: '', date: '' });
          setCurrentVersionId('Error');
          addLog(`版本检测失败: ${e?.message || String(e)}`, 'error');
        }
      } else {
        setLocalComfyVersion({ hash: 'Demo-Mode', fullHash: '', date: '2025-01-01' });
      }
    };
    fetchLocalInfo();
  }, []);  // 只在挂载时执行一次，避免 settings 变化导致重复调用

  // Fetch launcher version on startup
  useEffect(() => {
    const fetchLauncherVersion = async () => {
      if (window.electronAPI?.getLauncherVersion) {
        try {
          const versionInfo = await window.electronAPI.getLauncherVersion();
          setLauncherVersion(versionInfo);
          console.log('[Launcher Version]', versionInfo);
        } catch (error) {
          console.error('[Launcher Version] Failed to fetch:', error);
        }
      }
    };
    fetchLauncherVersion();
  }, []);

  // Listen for logs from Electron backend
  useEffect(() => {
    if (window.electronAPI) {
      const handleLog = (_event: any, log: { message: string, type: 'info' | 'error' | 'system' }) => {
        addLog(log.message, log.type);
        if (log.message.includes('http://127.0.0.1') || log.message.includes('To see the GUI go to')) {
          setStatus(AppStatus.RUNNING);
        }
        if (log.message.includes('进程已退出')) {
          setStatus(AppStatus.STOPPED);
        }
      };

      window.electronAPI.onLog(handleLog);

      // Cleanup listener
      return () => {
        window.electronAPI.removeLogListener(handleLog);
      };
    } else {
      addLog("正在浏览器演示模式下运行 (未连接后端)", 'error');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependencies - only run once on mount

  const handleStart = async () => {
    if (status === AppStatus.RUNNING) return;
    // Auto-switch to console to show startup logs
    setCurrentTab('console');

    // Removed auto-switch to console here to keep user context if they are on dashboard,
    // but usually users want to see logs. Leaving it optional, but prompt said "On version switch don't jump".
    // For start, it's usually good UI to show logs, but let's stick to Dashboard or current tab.
    // If on Dashboard, maybe stay on Dashboard? Let's just update status.
    // Actually, usually launchers switch to console. I'll leave it unless requested otherwise.
    // Wait, the prompt specifically said "On version management page... don't jump". 
    // It didn't say "On Start don't jump". But logically, if I start from Console, I stay.
    // If I start from Dashboard, I might want to see logs.
    // Let's keep it simply updating status.

    setStatus(AppStatus.STARTING);
    try {
      if (window.electronAPI) {
        await window.electronAPI.startComfy(settings, mode);
      } else {
        addLog("模拟启动...", 'system');
        setTimeout(() => {
          addLog("ComfyUI server started on port 8188", "info");
          setStatus(AppStatus.RUNNING);
        }, 1000);
      }
    } catch (e) {
      setStatus(AppStatus.STOPPED);
      addLog(`启动出错: ${e}`, 'error');
    }
  };

  const handleStop = async () => {
    setStatus(AppStatus.STOPPING);
    if (window.electronAPI) {
      await window.electronAPI.stopComfy();
    } else {
      setTimeout(() => setStatus(AppStatus.STOPPED), 1000);
    }
  };

  const handleOpenCmd = async () => {
    if (window.electronAPI) {
      addLog("正在打开终端环境...", "system");
      await window.electronAPI.openTerminal(settings);
    } else {
      alert("请在桌面版中使用此功能");
    }
  };


  const handleVersionUpdate = async (version: VersionInfo) => {
    if (isUpdating) return;
    setIsUpdating(true);
    // REMOVED: setCurrentTab('console');  <-- Requested change: Don't jump pages

    try {
      addLog(`准备切换到版本: ${version.id}`, 'system');

      if (window.electronAPI) {
        addLog("执行: git fetch origin...", "info");
        await window.electronAPI.gitCommand('fetch origin', settings);
        addLog(`执行: git checkout ${version.id}...`, "info");
        await window.electronAPI.gitCommand(`checkout ${version.id}`, settings);

        addLog('版本切换成功!', 'system');

        // Re-fetch local version info after checkout
        try {
          console.log('[Version Update] Re-fetching local version info...');

          // Get short hash
          const shortHashResult = await window.electronAPI.gitCommand('rev-parse --short HEAD', settings);
          const shortHash = shortHashResult?.trim() || version.id;

          // Get full hash
          const fullHashResult = await window.electronAPI.gitCommand('rev-parse HEAD', settings);
          const fullHash = fullHashResult?.trim() || '';

          // Get date
          const dateResult = await window.electronAPI.gitCommand('log -1 --format=%ci', settings);
          let formattedDate = '';
          if (dateResult) {
            const isoDate = dateResult.trim();
            const date = new Date(isoDate);
            formattedDate = date.toLocaleString('zh-CN', { hour12: false }).replace(/\//g, '-');
          }

          console.log(`[Version Update] New version: ${shortHash} (${fullHash}) - ${formattedDate}`);

          setCurrentVersionId(shortHash);
          setLocalComfyVersion({
            hash: shortHash,
            fullHash: fullHash,
            date: formattedDate
          });

          addLog(`当前版本已更新: ${shortHash}`, 'system');
        } catch (error) {
          console.error('[Version Update] Failed to refresh version info:', error);
          setCurrentVersionId(version.id);
        }
      } else {
        setTimeout(() => {
          addLog('模拟切换成功', 'system');
          setCurrentVersionId(version.id);
          setIsUpdating(false);
        }, 2000);
        return;
      }
    } catch (e) {
      addLog(`操作失败: ${e}`, 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const renderContent = () => {
    switch (currentTab) {
      case 'dashboard':
        return (
          <Dashboard
            status={status}
            mode={mode}
            comfyVersion={localComfyVersion}
            launcherVersion={launcherVersion}
            onToggleMode={setMode}
            onStart={handleStart}
            onStop={handleStop}
          />
        );
      case 'console':
        return (
          <Console
            logs={logs}
            status={status}
            onOpenCmd={handleOpenCmd}
            onClearLogs={() => setLogs([])}
            onStart={handleStart}
            onStop={handleStop}
          />
        );
      case 'versions':
        return (
          <Versions
            onUpdate={handleVersionUpdate}
            currentVersionId={currentVersionId}
            isUpdating={isUpdating}
            useProxy={settings.useGitHubProxy || false}
            onProxyToggle={(enabled) => {
              const newSettings = { ...settings, useGitHubProxy: enabled };
              setSettings(newSettings);
              if (window.electronAPI) window.electronAPI.saveSettings(newSettings);
              addLog(`GitHub代理已${enabled ? '启用' : '关闭'}`, 'system');
            }}
            localVersion={localComfyVersion}
          />
        );
      case 'runninghub':
        return <RunningHub />;
      case 'settings':
        return <Settings settings={settings} onSave={(s) => {
          setSettings(s);
          if (window.electronAPI) window.electronAPI.saveSettings(s);
          addLog("配置已保存", 'system');
        }} />;
      case 'about':
        return <About />;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0e1a] text-gray-100 overflow-hidden">
      {/* Custom Title Bar */}
      <div className="h-8 bg-[#0d1117] flex items-center justify-between px-4 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-purple-400">{t('app.title')}</span>
          <span className="text-sm font-bold text-purple-400">V{launcherVersion.version}</span>
        </div>
        <div className="flex gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => {
              if (window.electronAPI && (window.electronAPI as any).minimizeWindow) {
                (window.electronAPI as any).minimizeWindow();
              }
            }}
            className="w-8 h-6 hover:bg-gray-700 rounded flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xs">─</span>
          </button>
          <button
            onClick={() => {
              if (window.electronAPI && (window.electronAPI as any).maximizeWindow) {
                (window.electronAPI as any).maximizeWindow();
              }
            }}
            className="w-8 h-6 hover:bg-gray-700 rounded flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xs">□</span>
          </button>
          <button
            onClick={() => {
              if (window.electronAPI && (window.electronAPI as any).closeWindow) {
                (window.electronAPI as any).closeWindow();
              }
            }}
            className="w-8 h-6 hover:bg-red-600 rounded flex items-center justify-center text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xs">✕</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Compact Sidebar */}
        <div className="w-20 bg-[#0d1117] border-r border-gray-800 flex flex-col items-center pt-2 gap-1">
          {/* Navigation Items */}
          <NavItem
            icon={<Play size={20} />}
            label={t('sidebar.dashboardShort')}
            active={currentTab === 'dashboard'}
            onClick={() => setCurrentTab('dashboard')}
          />
          <NavItem
            icon={<Terminal size={20} />}
            label={t('sidebar.console')}
            active={currentTab === 'console'}
            onClick={() => setCurrentTab('console')}
          />
          <NavItem
            icon={<Layers size={20} />}
            label={t('sidebar.versionsShort')}
            active={currentTab === 'versions'}
            onClick={() => setCurrentTab('versions')}
          />
          <NavItem
            icon={<Sparkles size={20} />}
            label={t('sidebar.runninghub')}
            active={currentTab === 'runninghub'}
            onClick={() => setCurrentTab('runninghub')}
          />
          <NavItem
            icon={<SettingsIcon size={20} />}
            label={t('sidebar.settingsShort')}
            active={currentTab === 'settings'}
            onClick={() => setCurrentTab('settings')}
          />
          <NavItem
            icon={<BookOpen size={20} />}
            label={t('sidebar.aboutShort')}
            active={currentTab === 'about'}
            onClick={() => setCurrentTab('about')}
          />

          {/* Spacer */}
          <div className="flex-1" />

          {/* Language Toggle */}
          <LanguageToggleButton />

          {/* Theme Toggle at Bottom */}
          <ThemeToggleButton />
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

// Language Toggle Button Component
const LanguageToggleButton: React.FC = () => {
  const { language, setLanguage } = useTranslation();
  return (
    <button
      onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
      className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-all text-gray-400 hover:bg-gray-800 hover:text-gray-200"
      title={language === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Globe size={20} />
      <span className="text-[10px] font-medium">{language === 'zh' ? 'EN' : '中文'}</span>
    </button>
  );
};

// Theme Toggle Button Component
const ThemeToggleButton: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();
  return (
    <button
      onClick={toggleTheme}
      className="w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-all text-gray-400 hover:bg-gray-800 hover:text-gray-200 mb-2"
      title={theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
    >
      {theme === 'dark' ? (
        <Moon size={20} />
      ) : (
        <Sun size={20} />
      )}
      <span className="text-[10px] font-medium">{t('sidebar.theme')}</span>
    </button>
  );
};

// Compact Navigation Item Component
const NavItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        w-16 h-16 flex flex-col items-center justify-center gap-1 rounded-lg transition-all
        ${active
          ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
          : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
        }
      `}
    >
      <div className="text-xl">{icon}</div>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
};

export default App;
