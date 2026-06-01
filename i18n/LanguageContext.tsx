import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import zh from './zh.json';
import en from './en.json';

// 支持的语言类型
export type Language = 'zh' | 'en';

// 翻译资源映射
const translations: Record<Language, typeof zh> = { zh, en };

// Context 类型定义
interface LanguageContextType {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}

// 创建 Context
const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// 存储 key
const STORAGE_KEY = 'launcher_language';

// Provider 组件
export const LanguageProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    // 从 localStorage 读取，默认中文
    const [language, setLanguageState] = useState<Language>(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return (saved === 'en' || saved === 'zh') ? saved : 'zh';
    });

    // 切换语言时保存到 localStorage
    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
        localStorage.setItem(STORAGE_KEY, lang);
    };

    // 翻译函数：支持嵌套 key 和参数替换
    const t = (key: string, params?: Record<string, string | number>): string => {
        const keys = key.split('.');
        let result: any = translations[language];

        for (const k of keys) {
            if (result && typeof result === 'object' && k in result) {
                result = result[k];
            } else {
                // 找不到翻译，返回 key 本身作为 fallback
                console.warn(`[i18n] Missing translation: ${key}`);
                return key;
            }
        }

        let text = typeof result === 'string' ? result : key;

        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
            });
        }

        return text;
    };

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

// 自定义 Hook
export const useTranslation = () => {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useTranslation must be used within a LanguageProvider');
    }
    return context;
};

// 导出默认语言
export default LanguageContext;
