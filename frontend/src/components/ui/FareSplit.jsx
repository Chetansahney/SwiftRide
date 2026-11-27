import { Moon, Clock, RotateCcw, Heart } from 'lucide-react';
import { FEATURES, fareBreakdown, formatFare } from '../../lib/config';
import { useLanguage } from '../../i18n/LanguageContext';

// "Where your ₹X goes" bar, plus plain-language lines for any return-trip fee,
// night charge, waiting charge or tip so nothing about the price is a surprise.
export default function FareSplit({ fare, breakdown, dark = false }) {
    const { t } = useLanguage();
    const split = fareBreakdown(fare, breakdown);
    if (!FEATURES.fareSplit || !split) {
        return null;
    }
    const muted = dark ? 'text-night-muted' : 'text-muted';
    const notes = [
        split.returnFee > 0 && { Icon: RotateCcw, text: t('fare.returnFee', { fee: formatFare(split.returnFee) }) },
        split.nightFee > 0 && { Icon: Moon, text: t('fare.nightFee', { fee: formatFare(split.nightFee) }) },
        split.waitingFee > 0 && { Icon: Clock, text: t('fare.waitingFee', { fee: formatFare(split.waitingFee) }) },
        split.tip > 0 && { Icon: Heart, text: t('fare.tip', { fee: formatFare(split.tip) }) },
    ].filter(Boolean);

    return (
        <div className={`flex flex-col gap-2 rounded-2xl px-4 py-3 ${dark ? 'bg-night-card' : 'bg-paper'}`}>
            <strong className="text-[13px] font-semibold">{t('ride.fareSplitTitle', { fare: formatFare(split.total) })}</strong>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                <div className={dark ? 'bg-volt' : 'bg-ink'} style={{ flex: split.driver }} />
                <div className="bg-[#8A8F99]" style={{ flex: split.platform }} />
                <div className="bg-[#C5C9D0]" style={{ flex: split.gst }} />
            </div>
            <div className={`flex justify-between text-xs ${muted}`}>
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
            {notes.length ? (
                <ul className={`mt-1 flex flex-col gap-1.5 border-t pt-2 text-xs leading-snug ${dark ? 'border-night-line' : 'border-line'}`}>
                    {notes.map((note) => {
                        const NoteIcon = note.Icon;
                        return (
                            <li key={note.text} className="flex items-start gap-2">
                                <NoteIcon size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                                <span>{note.text}</span>
                            </li>
                        );
                    })}
                </ul>
            ) : null}
        </div>
    );
}
