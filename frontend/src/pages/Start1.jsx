import { Link } from 'react-router-dom';
import { GuaranteePill, LanguagePicker, Logo } from '../components/ui/Brand';
import { useLanguage } from '../i18n/LanguageContext';
import { FEATURES } from '../lib/config';

const Start = () => {
    const { t } = useLanguage();
    return (
        <div className="relative flex min-h-full flex-col justify-between overflow-hidden bg-ink px-6 pb-9 pt-16 text-white">
            <svg
                className="pointer-events-none absolute left-0 top-[90px] w-full"
                height="340"
                viewBox="0 0 390 340"
                preserveAspectRatio="xMidYMid slice"
                fill="none"
                aria-hidden="true"
            >
                <path d="M-20 280 C 60 280, 80 180, 160 180 S 250 70, 330 70 L 420 70" stroke="#2A2D33" strokeWidth="40" strokeLinecap="round" />
                <path d="M-20 280 C 60 280, 80 180, 160 180 S 250 70, 330 70" stroke="#D4FF3A" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 12" />
                <circle cx="330" cy="70" r="14" fill="#D4FF3A" />
                <circle cx="330" cy="70" r="5" fill="#0E0F12" />
                <circle cx="70" cy="262" r="9" fill="#FFFFFF" />
            </svg>

            <div className="relative">
                <Logo dark size="lg" />
            </div>

            <div className="relative mx-auto flex w-full max-w-md flex-col gap-6">
                <div className="flex flex-col gap-3.5">
                    {FEATURES.rideGuarantee ? <GuaranteePill>{t('guarantee.name')}</GuaranteePill> : null}
                    <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-tight">{t('brand.tagline')}</h1>
                    <p className="text-base leading-relaxed text-[#B4B8C0]">
                        {FEATURES.rideGuarantee ? `${t('guarantee.welcome')} ` : ''}
                        {t('welcome.sub')}
                    </p>
                </div>

                <LanguagePicker />

                <div className="flex flex-col gap-3">
                    <Link to="/Userlogin" className="btn-volt">
                        {t('welcome.start')}
                    </Link>
                    <Link
                        to="/captainlogin"
                        className="flex h-14 w-full items-center justify-center rounded-[14px] border border-night-edge text-base font-medium text-white"
                    >
                        {t('welcome.drive')}
                    </Link>
                    <p className="mt-1 text-center text-xs text-[#8A8F99]">{t('welcome.terms')}</p>
                </div>
            </div>
        </div>
    );
};

export default Start;
