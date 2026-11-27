import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_EVERY_MS = 20000;
const NEAR_DROP_M = 300;
// Moving this much further from the drop than the closest point so far looks like a wrong turn.
const DEVIATION_M = 700;
const MOVED_M = 50;
const LONG_STOP_MS = 4 * 60 * 1000;
const COOLDOWN_MS = 5 * 60 * 1000;

function metersBetween(a, b) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// Watches the rider's own phone position during a ride (it travels with the
// vehicle) and returns 'route_deviation' or 'long_stop' when something looks
// wrong, so the app can ask "Are you okay?".
export default function useSafetyMonitor({ active, position, dropPoint }) {
    const [trigger, setTrigger] = useState(null);
    const positionRef = useRef(position);
    // Reset with real timestamps when monitoring starts (below).
    const stateRef = useRef({ closest: Infinity, lastMovePos: null, lastMoveAt: 0, quietUntil: 0 });

    useEffect(() => {
        positionRef.current = position;
    }, [position]);

    useEffect(() => {
        if (!active || dropPoint?.lat == null) return undefined;
        stateRef.current = { closest: Infinity, lastMovePos: null, lastMoveAt: Date.now(), quietUntil: 0 };
        const timer = setInterval(() => {
            const pos = positionRef.current;
            const state = stateRef.current;
            const now = Date.now();
            if (!pos || now < state.quietUntil) return;

            const fromDrop = metersBetween(pos, dropPoint);
            if (fromDrop < NEAR_DROP_M) return;
            state.closest = Math.min(state.closest, fromDrop);

            if (!state.lastMovePos || metersBetween(pos, state.lastMovePos) > MOVED_M) {
                state.lastMovePos = pos;
                state.lastMoveAt = now;
            }

            if (fromDrop - state.closest > DEVIATION_M) {
                state.quietUntil = now + COOLDOWN_MS;
                setTrigger('route_deviation');
            } else if (now - state.lastMoveAt > LONG_STOP_MS) {
                state.quietUntil = now + COOLDOWN_MS;
                state.lastMoveAt = now;
                setTrigger('long_stop');
            }
        }, CHECK_EVERY_MS);
        return () => clearInterval(timer);
    }, [active, dropPoint]);

    // After "I'm safe", start measuring again from where the rider is now.
    const clear = useCallback(() => {
        stateRef.current.closest = Infinity;
        setTrigger(null);
    }, []);

    return { trigger, clear };
}
