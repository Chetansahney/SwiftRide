import { useCallback, useEffect, useState } from 'react';

// A web app that is hidden (screen locked, another app opened) stops sending
// the captain's location, so after 2 minutes they count as offline and the
// rider's map freezes. While `active`, this keeps the screen on with the Screen
// Wake Lock API (Chrome on Android, Safari 16.4+) and reports how long the app
// was last hidden, so the captain can be told they may have missed rides.
export default function useKeepAwake(active) {
    const [screenOn, setScreenOn] = useState(false);
    const [awayMs, setAwayMs] = useState(0);

    useEffect(() => {
        if (!active) return undefined;
        let lock = null;
        let cancelled = false;
        let hiddenAt = null;

        const request = async () => {
            if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
            try {
                const next = await navigator.wakeLock.request('screen');
                if (cancelled) {
                    next.release().catch(() => {});
                    return;
                }
                lock = next;
                setScreenOn(true);
                next.addEventListener('release', () => setScreenOn(false));
            } catch {
                // Refused, for example by battery saver: the reminder stays up.
                setScreenOn(false);
            }
        };
        // The browser drops the lock whenever the page is hidden; take it again on return.
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
                return;
            }
            if (hiddenAt) setAwayMs(Date.now() - hiddenAt);
            hiddenAt = null;
            request();
        };

        request();
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisibility);
            lock?.release().catch(() => {});
        };
    }, [active]);

    const clearAway = useCallback(() => setAwayMs(0), []);
    return { screenOn: active && screenOn, awayMs: active ? awayMs : 0, clearAway };
}
