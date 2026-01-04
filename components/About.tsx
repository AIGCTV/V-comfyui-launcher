import React, { useState } from 'react';
import { ExternalLink, Youtube, Music, Tv, Heart, Video as VideoIcon, MessageSquare, Globe, Package, Database, BookOpen, Gift, Github } from 'lucide-react';
import { useTranslation } from '../i18n';

export const About: React.FC = () => {
    const { t } = useTranslation();
    const [hoveredSocial, setHoveredSocial] = useState<string | null>(null);

    const openLink = (url: string) => {
        // Don't show alert, tooltip handles it
        if (window.electronAPI) {
            window.electronAPI.openUrl(url);
        } else {
            window.open(url, '_blank');
        }
    };

    const socialLinks = [
        { name: "Youtube", icon: <Youtube size={18} />, color: "hover:bg-red-600/20 hover:border-red-600", url: "https://www.youtube.com/@AIGC_TV" },
        { name: "抖音", icon: <Music size={18} />, color: "hover:bg-gray-100/20 hover:border-white", url: "https://v.douyin.com/oxJOXC5R5EI" },
        { name: "Bilibili", icon: <Tv size={18} />, color: "hover:bg-pink-400/20 hover:border-pink-400", url: "https://space.bilibili.com/3546670109296710" },
        { name: "小红书", icon: <Heart size={18} />, color: "hover:bg-red-500/20 hover:border-red-500", url: "https://xiaohongshu.com/user/profile/6629cdd10000000003030bc5" },
        { name: "视频号", icon: <VideoIcon size={18} />, color: "hover:bg-green-400/20 hover:border-green-400", url: "#", tooltip: "搜索 AIGCTV" },
        { name: "公众号", icon: <MessageSquare size={18} />, color: "hover:bg-green-500/20 hover:border-green-500", url: "#", tooltip: "搜索 AIGCTV" },
        { name: "知识星球", icon: <Globe size={18} />, color: "hover:bg-blue-400/20 hover:border-blue-400", url: "https://wx.zsxq.com/group/88888418288522" },
    ];

    const resourceLinks = [
        { name: "ComfyUI整合包", icon: <Package size={18} />, color: "hover:bg-purple-500/20 hover:border-purple-500", url: "https://fcnindgiaxi4.feishu.cn/wiki/UcqtwbJzeiX5dbkiNGBcoClInlg" },
        { name: "模型库", icon: <Database size={18} />, color: "hover:bg-blue-500/20 hover:border-blue-500", url: "https://pan.quark.cn/s/cc750e23e454" },
        { name: "知识库", icon: <BookOpen size={18} />, color: "hover:bg-green-500/20 hover:border-green-500", url: "https://fcnindgiaxi4.feishu.cn/wiki/S50Hwm8qBiFM2YkTmhPcTwSnn2d" },
        { name: "代码库", icon: <Github size={18} />, color: "hover:bg-gray-400/20 hover:border-gray-400", url: "https://github.com/AIGCTV/comfyui-photoshop-fix" },
        { name: "专属福利", icon: <Gift size={18} />, color: "hover:bg-red-500/20 hover:border-red-500", url: "https://fcnindgiaxi4.feishu.cn/wiki/YgQKwKKqDigMvak1xrLczvOrnOb" },
    ];

    const featuredTutorials = [
        { title: "PS-AI插件使用全攻略", date: "B站", views: "全网200W+", url: "https://space.bilibili.com/3546670109296710/lists/6277151" },
        { title: "PS-石头AI插件教程", date: "B站", views: "全网10W+", url: "https://space.bilibili.com/3546670109296710/lists/6276896" },
    ];

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
                        <h1 className="text-2xl font-bold text-white tracking-wide mb-1">AIGCTV 全网同名</h1>
                        <p className="text-sm text-gray-400 max-w-lg mx-auto">
                            专注 AIGC 技术分享，提供最优质的 ComfyUI 工作流与前沿教程。
                        </p>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto p-8 space-y-8">

                {/* Social Grid - Smaller Square Icons */}
                <section>
                    <h2 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <span className="w-1 h-5 bg-blue-500 rounded-full"></span>
                        同步更新
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
                                    <span className="font-medium text-gray-300 text-xs">{item.name}</span>
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

                {/* Resource Links Section */}
                <section>
                    <h2 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                        <span className="w-1 h-5 bg-green-500 rounded-full"></span>
                        资源分享
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {resourceLinks.map((item, idx) => (
                            <div
                                key={idx}
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

                {/* Tutorials List */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-200 flex items-center gap-2">
                            <span className="w-1 h-5 bg-purple-500 rounded-full"></span>
                            精彩教程合集
                        </h2>
                        <button
                            onClick={() => openLink('https://www.iesdouyin.com/share/playlet/detail/7410359478745073715')}
                            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                        >
                            查看更多 <ExternalLink size={12} />
                        </button>
                    </div>

                    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden shadow-sm">
                        {featuredTutorials.map((t, i) => (
                            <div
                                key={i}
                                className="p-4 flex items-center justify-between border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors cursor-pointer group"
                                onClick={() => openLink(t.url)}
                            >
                                <div className="flex items-center gap-4">
                                    <span className="text-gray-500 font-mono text-sm w-6">0{i + 1}</span>
                                    <span className="text-gray-200 font-medium group-hover:text-blue-400 transition-colors">
                                        {t.title}
                                    </span>
                                </div>
                                <div className="flex items-center gap-6 text-sm text-gray-500">
                                    <span className="hidden sm:inline">{t.date}</span>
                                    <span className="font-mono text-blue-400 font-semibold">
                                        {t.views}
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