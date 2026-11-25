import { shortPlace } from '../lib/config';
import { useLanguage } from '../i18n/LanguageContext';

// Pickup → drop timeline: a volt dot for pickup, a square for drop, joined by a line.
export default function RouteSummary({ pickup, destination, dark = false }) {
    const { t } = useLanguage();
    const sub = dark ? 'text-night-muted' : 'text-muted';
    return (
        <div className={`relative flex flex-col gap-4 rounded-2xl p-4 ${dark ? 'bg-night-card' : 'bg-paper'}`}>
            <span className={`absolute bottom-9 left-[21px] top-9 w-0.5 ${dark ? 'bg-night-line' : 'bg-line'}`} aria-hidden="true" />
            <div className="relative flex items-start gap-3">
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-ink bg-volt" aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                    <span className={`text-xs ${sub}`}>{t('ride.pickup')}</span>
                    <strong className="truncate text-[15px] font-semibold">{shortPlace(pickup) || '—'}</strong>
                    {pickup && pickup !== shortPlace(pickup) ? <span className={`truncate text-xs ${sub}`}>{pickup}</span> : null}
                </span>
            </div>
            <div className="relative flex items-start gap-3">
                <span className={`mt-1 h-3 w-3 shrink-0 rounded-[3px] ${dark ? 'bg-white' : 'bg-ink'}`} aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                    <span className={`text-xs ${sub}`}>{t('ride.drop')}</span>
                    <strong className="truncate text-[15px] font-semibold">{shortPlace(destination) || '—'}</strong>
                    {destination && destination !== shortPlace(destination) ? (
                        <span className={`truncate text-xs ${sub}`}>{destination}</span>
                    ) : null}
                </span>
            </div>
        </div>
    );
}
