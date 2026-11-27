import { useLanguage } from '../../i18n/LanguageContext';
import { LANGUAGES } from '../../i18n/strings';

export function Logo({ dark = false, size = 'md' }) {
    const big = size === 'lg';
    return (
        <span className="inline-flex items-center gap-2.5" aria-label="SwiftRide">
            <span
                className={`${big ? 'h-[26px] w-4' : 'h-[22px] w-[13px]'} -skew-x-[14deg] rounded-[5px] bg-volt ${dark ? '' : 'border-2 border-ink'}`}
                aria-hidden="true"
            />
            <span
                className={`font-display font-bold tracking-tight ${big ? 'text-[26px]' : 'text-[22px]'} ${dark ? 'text-white' : 'text-ink'}`}
                aria-hidden="true"
            >
                swiftride
            </span>
        </span>
    );
}

// Small pill in the top bar that cycles EN → हिं → বাং.
export function LanguageToggle({ dark = false }) {
    const { current, cycleLang, t } = useLanguage();
    const next = LANGUAGES[(LANGUAGES.indexOf(current) + 1) % LANGUAGES.length];
    return (
        <button
            type="button"
            onClick={cycleLang}
            aria-label={`${t('lang.label')}: ${current.label}. ${next.label}`}
            className={`flex h-12 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-float ${dark ? 'bg-night-card text-white' : 'bg-white text-ink'}`}
        >
            {current.short}
            <span className={dark ? 'text-night-muted' : 'text-muted'} aria-hidden="true">
                |
            </span>
            <span className={dark ? 'text-night-muted' : 'text-muted'}>{next.short}</span>
        </button>
    );
}

// Full three-way picker used on the welcome screen.
export function LanguagePicker({ dark = true }) {
    const { lang, setLang, t } = useLanguage();
    return (
        <div className="flex flex-col gap-2">
            <span className={`text-[13px] ${dark ? 'text-[#B4B8C0]' : 'text-muted'}`}>{t('welcome.chooseLang')}</span>
            <div role="radiogroup" aria-label={t('lang.label')} className="grid grid-cols-3 gap-2">
                {LANGUAGES.map((language) => {
                    const selected = language.code === lang;
                    return (
                        <button
                            key={language.code}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => setLang(language.code)}
                            className={`h-12 rounded-[14px] text-[15px] font-semibold transition ${
                                selected
                                    ? dark
                                        ? 'bg-white text-ink'
                                        : 'bg-ink text-white'
                                    : dark
                                        ? 'border border-night-edge text-white'
                                        : 'border border-line text-ink'
                            }`}
                        >
                            {language.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export function GuaranteePill({ children }) {
    return (
        <span className="chip self-start bg-volt text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                <path d="M9 12l2 2 4-4" />
            </svg>
            {children}
        </span>
    );
}
