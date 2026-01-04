import React from 'react';
import { Play, Layers, Settings, BookOpen, Terminal, Globe } from 'lucide-react';
import { TabView } from '../types';
import { useTranslation } from '../i18n';

interface SidebarProps {
  currentTab: TabView;
  setTab: (tab: TabView) => void;
  launcherVersion?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setTab, launcherVersion = 'V1.0.1' }) => {
  const { t, language, setLanguage } = useTranslation();

  const navItems: { id: TabView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: t('sidebar.dashboard'), icon: <Play size={20} /> },
    { id: 'console', label: t('console.title'), icon: <Terminal size={20} /> },
    { id: 'versions', label: t('sidebar.versions'), icon: <Layers size={20} /> },
    { id: 'settings', label: t('sidebar.settings'), icon: <Settings size={20} /> },
    { id: 'about', label: t('sidebar.about'), icon: <BookOpen size={20} /> },
  ];

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  return (
    <div className="w-20 lg:w-64 bg-[#202020] flex flex-col h-full border-r border-black/20 z-10 shrink-0">
      {/* App Header */}
      <div className="h-16 flex items-center justify-center lg:justify-start lg:px-6 border-b border-gray-800/50">
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 hidden lg:block tracking-wider">
          {t('app.title')}
        </span>
        <span className="lg:hidden text-purple-500 font-bold">TV</span>
      </div>

      <nav className="flex-1 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-4 px-0 lg:px-6 py-4 transition-all duration-200 border-l-4 ${isActive
                ? 'border-blue-500 bg-[#2d2d2d] text-white'
                : 'border-transparent text-gray-400 hover:bg-[#252525] hover:text-gray-200'
                }`}
            >
              <div className={`flex justify-center w-20 lg:w-auto ${isActive ? 'text-blue-400' : ''}`}>
                {item.icon}
              </div>
              <span className="font-medium hidden lg:block tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-gray-800/50 space-y-2">
        <div className="flex items-center justify-center lg:justify-between gap-2">
          {/* 语言切换按钮 */}
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
            title={language === 'zh' ? 'Switch to English' : '切换到中文'}
          >
            <Globe size={14} />
            <span className="hidden lg:inline">{language === 'zh' ? 'EN' : '中文'}</span>
          </button>
          {/* 版本号 */}
          <div className="text-center text-[10px] text-gray-600 font-mono">
            {launcherVersion}
          </div>
        </div>
      </div>
    </div>
  );
};