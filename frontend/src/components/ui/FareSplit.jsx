import { FEATURES, fareBreakdown, formatFare } from '../../lib/config';
import { useLanguage } from '../../i18n/LanguageContext';

export default function FareSplit({ fare, dark = false }) {
    const { t } = useLanguage();
    const split = fareBreakdown(fare);
    if (!FEATURES.fareSplit || !split) {
        return null;
    }
    return (
        <div className={`flex flex-col gap-2 rounded-2xl px-4 py-3 ${dark ? 'bg-night-card' : 'bg-paper'}`}>
            <strong className="text-[13px] font-semibold">{t('ride.fareSplitTitle', { fare: formatFare(split.total) })}</strong>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                <div className={dark ? 'bg-volt' : 'bg-ink'} style={{ flex: split.driver }} />
                <div className="bg-[#8A8F99]" style={{ flex: split.platform }} />
                <div className="bg-[#C5C9D0]" style={{ flex: split.gst }} />
            </div>
            <div className={`flex justify-between text-xs ${dark ? 'text-night-muted' : 'text-muted'}`}>
                <span>
                    {t('ride.driver')} {formatFare(split.driver)}
                </span>
                <span>
                    {t('ride.platform')} {formatFare(split.platform)}
                </span>
                <span>
                    {t('ride.gst')} {formatFare(split.gst)}
                </span>
            </div>
        </div>
    );
}
