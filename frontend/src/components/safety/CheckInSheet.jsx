import { useEffect, useRef, useState } from 'react';
import { ShieldCheck, TriangleAlert } from 'lucide-react';
import BottomSheet from '../ui/BottomSheet';
import { useLanguage } from '../../i18n/LanguageContext';

const ANSWER_SECONDS = 30;

// "Are you okay?" — shown when the ride goes off course or stops for a long
// time. No answer within 30 seconds counts as "needs help".
export default function CheckInSheet({ reason, onAnswer }) {
    const { t } = useLanguage();
    const open = Boolean(reason);
    const [secondsLeft, setSecondsLeft] = useState(ANSWER_SECONDS);
    const answeredRef = useRef(false);
    const onAnswerRef = useRef(onAnswer);

    useEffect(() => {
        onAnswerRef.current = onAnswer;
    }, [onAnswer]);

    useEffect(() => {
        if (!open) return undefined;
        answeredRef.current = false;
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const left = Math.max(0, ANSWER_SECONDS - Math.floor((Date.now() - startedAt) / 1000));
            setSecondsLeft(left);
            if (left === 0 && !answeredRef.current) {
                answeredRef.current = true;
                clearInterval(timer);
                onAnswerRef.current('no_response');
            }
        }, 250);
        return () => clearInterval(timer);
    }, [open, reason]);

    const answer = (response) => {
        if (answeredRef.current) return;
        answeredRef.current = true;
        onAnswer(response);
    };

    return (
        <BottomSheet open={open} onClose={() => {}} title={t('safety.areYouOk')} dismissable={false}>
            <p className="text-base">{reason === 'long_stop' ? t('safety.stopBody') : t('safety.deviationBody')}</p>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => answer('ok')} className="btn-volt h-16 gap-2 text-lg">
                    <ShieldCheck size={22} aria-hidden="true" />
                    {t('safety.imSafe')}
                </button>
                <button type="button" onClick={() => answer('help')} className="flex h-16 items-center justify-center gap-2 rounded-[14px] bg-signal text-lg font-semibold text-white">
                    <TriangleAlert size={22} aria-hidden="true" />
                    {t('safety.needHelp')}
                </button>
            </div>
            <p className="text-center text-sm text-muted" aria-live="polite">
                {t('safety.autoAlert', { seconds: secondsLeft })}
            </p>
        </BottomSheet>
    );
}
