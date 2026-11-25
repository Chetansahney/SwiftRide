import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, STRINGS } from './strings';

const STORAGE_KEY = 'swiftride.lang';

const LanguageContext = createContext(null);

function initialLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.some((language) => language.code === saved) ? saved : 'en';
}

export function LanguageProvider({ children }) {
    const [lang, setLangState] = useState(initialLanguage);

    const setLang = useCallback((code) => {
        setLangState(code);
        localStorage.setItem(STORAGE_KEY, code);
    }, []);

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const value = useMemo(() => {
        const dictionary = STRINGS[lang] || STRINGS.en;
        const t = (key, vars) => {
            let text = dictionary[key] ?? STRINGS.en[key] ?? key;
            if (vars) {
                Object.entries(vars).forEach(([name, replacement]) => {
                    text = text.replaceAll(`{${name}}`, replacement);
                });
            }
            return text;
        };
        const current = LANGUAGES.find((language) => language.code === lang) || LANGUAGES[0];
        const cycleLang = () => {
            const index = LANGUAGES.findIndex((language) => language.code === lang);
            setLang(LANGUAGES[(index + 1) % LANGUAGES.length].code);
        };
        return { lang, setLang, cycleLang, current, t };
    }, [lang, setLang]);

    return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        throw new Error('useLanguage must be used inside LanguageProvider');
    }
    return context;
}
