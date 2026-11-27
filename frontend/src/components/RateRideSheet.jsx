import { useState } from 'react';
import { Star } from 'lucide-react';
import BottomSheet from './ui/BottomSheet';
import { useLanguage } from '../i18n/LanguageContext';

// Five big stars (easy to hit on a phone) and an optional note.
// `submit(stars, comment)` sends it; `onDone` runs after submit or skip.
export default function RateRideSheet({ open, title, submit, onDone, dark = false, withComment = true }) {
    const { t } = useLanguage();
    const [stars, setStars] = useState(0);
    const [comment, setComment] = useState('');
    const [busy, setBusy] = useState(false);

    const send = async () => {
        if (!stars || busy) return;
        setBusy(true);
        try {
            await submit(stars, comment.trim());
        } catch {
            // A failed rating shouldn't block the person from moving on.
        } finally {
            setBusy(false);
            onDone();
        }
    };

    return (
        <BottomSheet open={open} onClose={onDone} title={title} dark={dark}>
            <div role="radiogroup" aria-label={title} className="flex justify-between gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={stars === n}
                        aria-label={t('rate.stars', { n })}
                        onClick={() => setStars(n)}
                        className="flex h-14 flex-1 items-center justify-center rounded-2xl"
                    >
                        <Star size={38} strokeWidth={1.8} className={n <= stars ? 'fill-volt text-ink' : dark ? 'text-night-muted' : 'text-line'} aria-hidden="true" />
                    </button>
                ))}
            </div>
            {withComment ? (
                <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value.slice(0, 300))}
                    placeholder={t('rate.comment')}
                    aria-label={t('rate.comment')}
                    rows={2}
                    className={`field resize-none ${dark ? 'bg-night-card text-white' : ''}`}
                />
            ) : null}
            <button type="button" onClick={send} disabled={!stars || busy} className="btn-primary disabled:opacity-50">
                {t('rate.submit')}
            </button>
            <button type="button" onClick={onDone} className={dark ? 'h-12 text-sm font-semibold text-night-muted' : 'btn-ghost'}>
                {t('rate.skip')}
            </button>
        </BottomSheet>
    );
}
