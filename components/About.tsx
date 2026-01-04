import React, { useState, useEffect } from 'react';
import { ExternalLink, Youtube, Music, Tv, Heart, Video as VideoIcon, MessageSquare, Globe, Package, Database, BookOpen, Gift, Github } from 'lucide-react';
import { useTranslation } from '../i18n';
import {
    loadConfig,
    getResourcesConfig,
    getTutorialsConfig,
    ResourceConfig,
    TutorialsConfig,
    DEFAULT_RESOURCES,
    DEFAULT_TUTORIALS,
} from '../services/remoteConfig';

// 资源 ID 到图标的映射
const RESOURCE_ICON_MAP: Record<string, React.ReactNode> = {
    comfyPack: <Package size={18} />,
    modelLib: <Database size={18} />,
    knowledgeBase: <BookOpen size={18} />,
    codeRepo: <Github size={18} />,
    welfare: <Gift size={18} />,
};

// 资源 ID 到颜色样式的映射
const RESOURCE_COLOR_MAP: Record<string, string> = {
    comfyPack: 'hover:bg-purple-500/20 hover:border-purple-500',
    modelLib: 'hover:bg-blue-500/20 hover:border-blue-500',
    knowledgeBase: 'hover:bg-green-500/20 hover:border-green-500',
    codeRepo: 'hover:bg-gray-400/20 hover:border-gray-400',
    welfare: 'hover:bg-red-500/20 hover:border-red-500',
};

export const About: React.FC = () => {
    const { t } = useTranslation();
    const [hoveredSocial, setHoveredSocial] = useState<string | null>(null);

    // 远程配置状态
    const [resources, setResources] = useState<ResourceConfig[]>(getResourcesConfig());
    const [tutorials, setTutorials] = useState<TutorialsConfig>(getTutorialsConfig());

    // 加载远程配置
    useEffect(() => {
        // 先立即使用缓存配置
        setResources(getResourcesConfig());
        setTutorials(getTutorialsConfig());

        // 后台拉取最新配置
        loadConfig((updatedConfig) => {
            // 远程配置更新回调
            if (updatedConfig.resources) {
                setResources(updatedConfig.resources);
            }
            if (updatedConfig.tutorials) {
                setTutorials(updatedConfig.tutorials);
            }
        });
    }, []);

    const openLink = (url: string) => {
        // Don't show alert, tooltip handles it
        if (window.electronAPI) {
            window.electronAPI.openUrl(url);
        } else {
            window.open(url, '_blank');
        }
    };

    // 社交链接（硬编码，不需要远程配置）
    const socialLinks = [
        { name: "Youtube", icon: <Youtube size={18} />, color: "hover:bg-red-600/20 hover:border-red-600", url: "https://www.youtube.com/@AIGC_TV" },
        { name: t('about.social.douyin'), icon: <Music size={18} />, color: "hover:bg-gray-100/20 hover:border-white", url: "https://v.douyin.com/oxJOXC5R5EI" },
        { name: t('about.social.bilibili'), icon: <Tv size={18} />, color: "hover:bg-pink-400/20 hover:border-pink-400", url: "https://space.bilibili.com/3546670109296710" },
        { name: t('about.social.xiaohongshu'), icon: <Heart size={18} />, color: "hover:bg-red-500/20 hover:border-red-500", url: "https://xiaohongshu.com/user/profile/6629cdd10000000003030bc5" },
        { name: t('about.social.channels'), icon: <VideoIcon size={18} />, color: "hover:bg-green-400/20 hover:border-green-400", url: "#", tooltip: t('about.searchTip') },
        { name: t('about.social.publicAccount'), icon: <MessageSquare size={18} />, color: "hover:bg-green-500/20 hover:border-green-500", url: "#", tooltip: t('about.searchTip') },
        { name: t('about.social.zsxq'), icon: <Globe size={18} />, color: "hover:bg-blue-400/20 hover:border-blue-400", url: "https://wx.zsxq.com/group/88888418288522" },
    ];

    // 从远程配置生成资源链接列表
    const resourceLinks = resources.map((r) => ({
        id: r.id,
        name: t(`about.links.${r.id}`),
        icon: RESOURCE_ICON_MAP[r.id] || <Package size={18} />,
        color: RESOURCE_COLOR_MAP[r.id] || 'hover:bg-gray-500/20 hover:border-gray-500',
        url: r.url,
    }));

    return (
        <div className="h-full overflow-y-auto scrollbar-default bg-gray-900">

            {/* Compact Hero Section */}
            <div className="relative bg-gray-800 py-6 text-center border-b border-gray-700">
                <div className="flex flex-col items-center justify-center gap-2">
                    {/* Smaller Logo */}
                    <div className="w-20 h-20 flex items-center justify-center">
                        <img src="./logo.png" alt="AIGC TV Logo" className="w-full h-full object-contain rounded-2xl" />
                    </div>

                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-wide mb-1">AIGCTV</h1>
                        <p className="text-sm text-gray-400 max-w-none mx-auto whitespace-nowrap px-4">
                            {t('about.desc')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-8 space-y-8">

                {/* Social Grid - Smaller Square Icons */}
                <section>
                    <h2 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                        {t('about.syncUpdate')}
                    </h2>
                    <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
                        {socialLinks.map((item, idx) => (
                            <div key={idx} className="relative">
                                <div
                                    onClick={() => !item.tooltip && openLink(item.url)}
                                    onMouseEnter={() => setHoveredSocial(item.name)}
                                    onMouseLeave={() => setHoveredSocial(null)}
                                    className={`bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:bg-gray-750 hover:-translate-y-1 hover:shadow-lg group ${item.color}`}
                                >
                                    <div className="text-gray-400 transition-colors group-hover:text-inherit">
                                        {item.icon}
                                    </div>
                                    <span className="font-medium text-gray-300 text-xs whitespace-nowrap">{item.name}</span>
                                </div>

                                {/* Tooltip for 视频号 and 公众号 */}
                                {item.tooltip && hoveredSocial === item.name && (
                                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs text-white whitespace-nowrap shadow-lg z-10">
                                        {item.tooltip}
                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 border-r border-b border-gray-600 rotate-45"></div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Resource Links Section - 使用远程配置 */}
                <section>
                    <h2 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <span className="w-1 h-5 bg-green-500 rounded-full"></span>
                        {t('about.shareResources')}
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {resourceLinks.map((item, idx) => (
                            <div
                                key={item.id || idx}
                                onClick={() => openLink(item.url)}
                                className={`bg-gray-800 border border-gray-700 rounded-lg p-3 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200 hover:bg-gray-750 hover:-translate-y-1 hover:shadow-lg group ${item.color}`}
                            >
                                <div className="text-gray-400 transition-colors group-hover:text-inherit">
                                    {item.icon}
                                </div>
                                <span className="font-medium text-gray-300 text-xs">{item.name}</span>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Tutorials List - 使用远程配置 */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
                            {t('about.tutorials')}
                        </h2>
                        <button
                            onClick={() => openLink(tutorials.viewMoreUrl)}
                            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                            {t('about.viewMore')} <ExternalLink size={12} />
                        </button>
                    </div>

                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
                        {tutorials.list.map((tutorial, i) => (
                            <div
                                key={i}
                                className="p-4 flex items-center justify-between border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors cursor-pointer group"
                                onClick={() => openLink(tutorial.url)}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-gray-500 font-mono text-sm w-6">0{i + 1}</span>
                                    <span className="text-gray-200 font-medium group-hover:text-blue-400 transition-colors">
                                        {tutorial.title}
                                    </span>
                                </div>
                                <div className="flex items-center gap-6 text-sm text-gray-500">
                                    <span className="hidden sm:inline">{tutorial.platform}</span>
                                    <span className="font-mono text-blue-400 font-semibold">
                                        {tutorial.views}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

            </div>
        </div>
    );
};