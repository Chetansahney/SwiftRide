import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API } from '../lib/api';

// Team-only console, protected by the ADMIN_KEY on the server. English only.
//  - Safety alerts: SOS presses, missed check-ins, wrong-driver reports. Checked
//    every 10 s while the page is open, with a sound and a pop-up for new ones.
//  - Captain checks: every new captain (after seeing their original papers),
//    women-captain confirmations, and unclear shift face checks.

const KEY_STORAGE = 'swiftrideAdminKey';
const NAME_STORAGE = 'swiftrideAdminName';
const ALERT_POLL_MS = 10000;

const pct = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`);
const shortPlace = (place) => (place ? String(place).split(',')[0].trim() : '—');
const phoneLabel = (phone) => `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
const mapLink = ({ lat, lng }) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

// Someone may be in danger right now.
const URGENT = new Set(['sos', 'silent_sos', 'not_safe', 'no_response', 'wrong_driver']);
const RIDE_STATUS = {
    requested: 'Looking for a captain',
    accepted: 'Captain on the way',
    ongoing: 'On the trip',
    completed: 'Ride ended',
    cancelled: 'Cancelled',
};
const ALERT_STATUS = {
    open: { label: 'New', style: 'bg-signal text-white' },
    acknowledged: { label: 'Someone is on it', style: 'bg-volt text-ink' },
    resolved: { label: 'Resolved', style: 'bg-paper text-muted' },
};

// What the reviewer must see in person before approving a captain: the app's
// licence and vehicle checks only test number formats so far.
const DOCUMENT_CHECKS = [
    { key: 'licence', label: 'Original driving licence seen: photo, name and date of birth match' },
    { key: 'vehicle', label: 'RC, insurance, fitness and permit seen: the number plate matches' },
    { key: 'police', label: 'Police verification certificate seen' },
];

function ago(date, now) {
    const seconds = Math.max(0, Math.round((now - new Date(date).getTime()) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
    return new Date(date).toLocaleString();
}

function CallLink({ phone, label }) {
    if (!phone) return <span className="text-xs text-muted">no number</span>;
    return (
        <a href={`tel:+91${phone}`} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-3 text-sm font-semibold text-white">
            Call {label ? `${label} · ` : ''}
            {phoneLabel(phone)}
        </a>
    );
}

// A beep and a system pop-up for new alerts. Browsers allow sound only after a
// tap on the page, hence the "Turn on" button.
function useAlertSignals() {
    const audio = useRef(null);
    const [armed, setArmed] = useState(false);

    const beep = useCallback(() => {
        const context = audio.current;
        if (!context) return;
        try {
            [0, 0.35].forEach((delay) => {
                const tone = context.createOscillator();
                const gain = context.createGain();
                const at = context.currentTime + delay;
                tone.type = 'square';
                tone.frequency.value = 880;
                gain.gain.setValueAtTime(0.0001, at);
                gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
                tone.connect(gain).connect(context.destination);
                tone.start(at);
                tone.stop(at + 0.3);
            });
        } catch {
            // no sound on this device
        }
    }, []);

    const arm = async () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audio.current = audio.current || new AudioContext();
            await audio.current.resume();
        } catch {
            audio.current = null;
        }
        if ('Notification' in window && Notification.permission === 'default') {
            await Notification.requestPermission().catch(() => {});
        }
        setArmed(true);
        beep();
    };

    const signal = useCallback(
        (alert) => {
            beep();
            if (!('Notification' in window) || Notification.permission !== 'granted') return;
            try {
                const popup = new Notification('SwiftRide safety alert', { body: alert.label, tag: String(alert.id), requireInteraction: true });
                popup.onclick = () => window.focus();
            } catch {
                // some phones only allow pop-ups from an installed app
            }
        },
        [beep]
    );

    return { armed, arm, signal };
}

function AlertCard({ alert, now, note, onNote, onAct, busy }) {
    const status = ALERT_STATUS[alert.status] || ALERT_STATUS.open;
    const open = alert.status === 'open';
    const linkStyle = 'inline-flex h-10 items-center rounded-full bg-paper px-3 text-sm font-semibold underline-offset-4 hover:underline';
    return (
        <article className={`flex flex-col gap-3 rounded-2xl bg-white p-4 ${open ? 'ring-2 ring-signal' : 'ring-1 ring-line'}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <strong className={`text-lg ${URGENT.has(alert.reason) ? 'text-signal' : ''}`}>
                    {alert.label} · {alert.raisedBy === 'system' ? 'automatic' : alert.raisedBy}
                </strong>
                <span className="text-xs text-muted">{ago(alert.createdAt, now)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`chip ${status.style}`}>{status.label}</span>
                {alert.handledBy ? <span className="text-muted">by {alert.handledBy}</span> : null}
                {alert.ride ? (
                    <span className="text-muted">
                        {RIDE_STATUS[alert.ride.status] || alert.ride.status} · {shortPlace(alert.ride.origin)} → {shortPlace(alert.ride.destination)}
                    </span>
                ) : null}
            </div>

            <dl className="flex flex-col gap-2 text-sm">
                {alert.rider ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <dt className="w-16 text-muted">Rider</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                            <strong>{alert.rider.name}</strong>
                            <CallLink phone={alert.rider.phone} />
                        </dd>
                    </div>
                ) : null}
                {alert.rider?.trustedContacts?.length ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <dt className="w-16 text-muted">Contacts</dt>
                        <dd className="flex flex-wrap gap-2">
                            {alert.rider.trustedContacts.map((contact) => (
                                <CallLink key={contact.phone} phone={contact.phone} label={contact.name} />
                            ))}
                        </dd>
                    </div>
                ) : null}
                {alert.captain ? (
                    <div className="flex flex-wrap items-center gap-2">
                        <dt className="w-16 text-muted">Captain</dt>
                        <dd className="flex flex-wrap items-center gap-2">
                            <strong>
                                {alert.captain.name} · {alert.captain.plate}
                            </strong>
                            <span className="text-muted">{alert.captain.vehicle}</span>
                            <CallLink phone={alert.captain.phone} />
                        </dd>
                    </div>
                ) : null}
            </dl>

            <div className="flex flex-wrap gap-2">
                {alert.location ? (
                    <a href={mapLink(alert.location)} target="_blank" rel="noopener noreferrer" className={linkStyle}>
                        Where it was raised ↗
                    </a>
                ) : null}
                {alert.captain?.liveLocation ? (
                    <a href={mapLink(alert.captain.liveLocation)} target="_blank" rel="noopener noreferrer" className={linkStyle}>
                        Vehicle now ↗
                    </a>
                ) : null}
                {alert.ride?.trackToken ? (
                    <a href={`/track/${alert.ride.trackToken}`} target="_blank" rel="noopener" className={linkStyle}>
                        Live trip ↗
                    </a>
                ) : null}
            </div>

            {alert.status === 'resolved' ? (
                <p className="rounded-xl bg-paper p-3 text-sm">
                    <strong>Resolved{alert.handledBy ? ` by ${alert.handledBy}` : ''}:</strong> {alert.note}
                </p>
            ) : (
                <div className="flex flex-col gap-2">
                    {open ? (
                        <button type="button" disabled={busy} onClick={() => onAct(alert, 'acknowledge')} className="h-12 rounded-xl bg-signal font-semibold text-white disabled:opacity-50">
                            I’m on it
                        </button>
                    ) : null}
                    <label className="sr-only" htmlFor={`note-${alert.id}`}>
                        What happened
                    </label>
                    <textarea
                        id={`note-${alert.id}`}
                        rows={2}
                        maxLength={500}
                        value={note}
                        onChange={(event) => onNote(event.target.value)}
                        placeholder="What happened? (needed to resolve)"
                        className="rounded-xl border border-line p-3 text-sm outline-none focus:border-ink"
                    />
                    <button
                        type="button"
                        disabled={busy || note.trim().length < 3}
                        onClick={() => onAct(alert, 'resolve')}
                        className="h-11 rounded-xl bg-ink font-semibold text-white disabled:opacity-40"
                    >
                        Resolve
                    </button>
                    <p className="text-xs text-muted">Can’t reach them and they may be in danger? Call 112 and give the location.</p>
                </div>
            )}
        </article>
    );
}

function SafetyAlerts({ adminKey, onUnauthorized, onCount }) {
    const [alerts, setAlerts] = useState(null);
    const [showAll, setShowAll] = useState(false);
    const [error, setError] = useState(null);
    const [now, setNow] = useState(() => Date.now());
    const [name, setName] = useState(() => sessionStorage.getItem(NAME_STORAGE) || '');
    const [notes, setNotes] = useState({});
    const [busyId, setBusyId] = useState(null);
    const seen = useRef(null);
    const { armed, arm, signal } = useAlertSignals();

    const load = useCallback(() => {
        axios
            .get(`${API}/admin/safety-alerts`, { headers: { 'x-admin-key': adminKey }, params: showAll ? { status: 'all' } : undefined })
            .then(({ data }) => {
                // Alerts that arrived since the last check get a sound and a pop-up.
                if (seen.current) data.alerts.filter((alert) => alert.status === 'open' && !seen.current.has(String(alert.id))).forEach(signal);
                seen.current = new Set([...(seen.current || []), ...data.alerts.map((alert) => String(alert.id))]);
                setAlerts(data.alerts);
                onCount(data.openCount);
                setNow(Date.now());
                setError(null);
            })
            .catch((err) => {
                if (err.response?.status === 401) onUnauthorized();
                else setError('Could not load alerts. Trying again in a few seconds…');
            });
    }, [adminKey, showAll, signal, onCount, onUnauthorized]);

    useEffect(() => {
        load();
        const timer = setInterval(load, ALERT_POLL_MS);
        return () => clearInterval(timer);
    }, [load]);

    const act = async (alert, action) => {
        setBusyId(alert.id);
        try {
            await axios.post(
                `${API}/admin/safety-alerts/${alert.id}`,
                { action, note: notes[alert.id] || undefined, handledBy: name.trim() || undefined },
                { headers: { 'x-admin-key': adminKey } }
            );
            load();
        } catch (err) {
            setError(err.response?.data?.message || 'Could not save that.');
            load();
        } finally {
            setBusyId(null);
        }
    };

    return (
        <section className="flex flex-col gap-3" aria-label="Safety alerts">
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
                {armed ? (
                    <span className="text-sm font-semibold">Sound and pop-ups are on</span>
                ) : (
                    <button type="button" onClick={arm} className="h-11 rounded-xl bg-volt px-4 text-sm font-semibold text-ink">
                        Turn on sound and pop-ups
                    </button>
                )}
                <label className="ml-auto flex items-center gap-2 text-sm">
                    Your name
                    <input
                        value={name}
                        maxLength={40}
                        onChange={(event) => {
                            setName(event.target.value);
                            sessionStorage.setItem(NAME_STORAGE, event.target.value);
                        }}
                        className="h-10 w-36 rounded-lg border border-line px-2 outline-none focus:border-ink"
                    />
                </label>
            </div>
            <p className="text-xs text-muted">
                Checked every 10 seconds while this page is open, so keep it open during service hours. To get alerts on your phone without it, set SAFETY_WEBHOOK_URL on the
                server to a Slack, Discord or Google Chat webhook.
            </p>
            <div className="flex gap-2" role="group" aria-label="Which alerts">
                {[
                    { all: false, label: 'Open' },
                    { all: true, label: 'All, including resolved' },
                ].map((option) => (
                    <button
                        key={option.label}
                        type="button"
                        aria-pressed={showAll === option.all}
                        onClick={() => setShowAll(option.all)}
                        className={`h-10 rounded-full px-4 text-sm font-semibold ${showAll === option.all ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            {error ? <p className="rounded-xl bg-signal/10 p-3 text-sm text-signal">{error}</p> : null}
            {alerts?.length === 0 ? <p className="rounded-2xl bg-white p-4 text-sm text-muted">No open alerts.</p> : null}
            {alerts?.map((alert) => (
                <AlertCard
                    key={alert.id}
                    alert={alert}
                    now={now}
                    note={notes[alert.id] || ''}
                    onNote={(value) => setNotes((current) => ({ ...current, [alert.id]: value }))}
                    onAct={act}
                    busy={busyId === alert.id}
                />
            ))}
        </section>
    );
}

function Decision({ busy, onDecide, approveDisabled = false }) {
    return (
        <div className="flex gap-2">
            <button type="button" disabled={busy || approveDisabled} onClick={() => onDecide('approve')} className="h-11 flex-1 rounded-xl bg-volt font-semibold text-ink disabled:opacity-40">
                Approve
            </button>
            <button type="button" disabled={busy} onClick={() => onDecide('reject')} className="h-11 flex-1 rounded-xl bg-signal font-semibold text-white disabled:opacity-50">
                Reject
            </button>
        </div>
    );
}

function CaptainChecks({ adminKey, onUnauthorized, onCount }) {
    const [queue, setQueue] = useState(null);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);
    // captainId → ticked document checks
    const [ticks, setTicks] = useState({});

    const load = useCallback(() => {
        axios
            .get(`${API}/admin/verifications`, { headers: { 'x-admin-key': adminKey } })
            .then(({ data }) => {
                setQueue(data);
                onCount(data.identity.length + (data.gender?.length || 0) + data.shifts.length);
                setError(null);
            })
            .catch((err) => {
                if (err.response?.status === 401) onUnauthorized();
                else setError(err.response?.data?.message || 'Could not load the queue.');
            });
    }, [adminKey, onCount, onUnauthorized]);

    useEffect(load, [load]);

    const decide = async (captainId, kind, decision) => {
        setBusyId(`${captainId}-${kind}`);
        try {
            const checks = kind === 'identity' ? ticks[captainId] || [] : undefined;
            await axios.post(`${API}/admin/verifications/${captainId}`, { kind, decision, checks }, { headers: { 'x-admin-key': adminKey } });
            load();
        } catch (err) {
            setError(err.response?.data?.message || 'Could not save the decision.');
        } finally {
            setBusyId(null);
        }
    };

    const toggle = (captainId, key) =>
        setTicks((current) => {
            const list = current[captainId] || [];
            return { ...current, [captainId]: list.includes(key) ? list.filter((item) => item !== key) : [...list, key] };
        });

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-end">
                <button type="button" onClick={load} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
                    Refresh
                </button>
            </div>
            {error ? <p className="rounded-xl bg-signal/10 p-3 text-sm text-signal">{error}</p> : null}

            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">New captains ({queue?.identity.length ?? '…'})</h2>
                <p className="text-xs text-muted">
                    Every new captain waits here, even when the face check is sure: the licence and vehicle checks only test number formats so far. Call them, see the
                    original papers, then tick all three to approve.
                </p>
                {queue?.identity.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : null}
                {queue?.identity.map((item) => {
                    const ticked = ticks[item.captainId] || [];
                    return (
                        <article key={item.captainId} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <strong>
                                    {item.name?.firstname} {item.name?.lastname} · {item.vehicle?.plate}
                                </strong>
                                <span className="text-xs text-muted">{new Date(item.submittedAt).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <CallLink phone={item.phone} />
                                <span className="text-muted">
                                    {item.vehicle?.color} {item.vehicle?.model} · {item.vehicle?.vehicleType}
                                    {item.gender ? ` · declared ${item.gender === 'female' ? 'woman' : item.gender === 'male' ? 'man' : 'other'}` : ''}
                                </span>
                            </div>
                            <p className={`rounded-xl px-3 py-2 text-sm font-semibold ${item.engineDecision === 'verified' ? 'bg-volt/40' : 'bg-signal/10 text-signal'}`}>
                                {item.engineDecision === 'verified' ? 'Face check: clear match with the licence photo' : 'Face check: unsure. Look closely at both photos.'}
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <figure>
                                    <img src={item.dlImage} alt="Licence" className="aspect-[4/3] w-full rounded-xl bg-ink/5 object-contain" />
                                    <figcaption className="mt-1 text-xs text-muted">
                                        Licence ••••{item.dl?.last4} · {item.dl?.name} · {item.dl?.dob}
                                    </figcaption>
                                </figure>
                                <figure>
                                    <img src={item.selfieImage} alt="Selfie" className="aspect-[4/3] w-full rounded-xl bg-ink/5 object-contain" />
                                    <figcaption className="mt-1 text-xs text-muted">Live selfie</figcaption>
                                </figure>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                                <dt className="text-muted">Face match</dt>
                                <dd className="font-semibold">{pct(item.face?.fingerprintScore)}</dd>
                                <dt className="text-muted">Face dots</dt>
                                <dd className="font-semibold">
                                    {pct(item.face?.landmarkScore)}
                                    {item.face?.landmarkRedFlag ? ' ⚠' : ''}
                                </dd>
                                <dt className="text-muted">Second opinion</dt>
                                <dd className="font-semibold">{pct(item.face?.faceresScore)}</dd>
                                <dt className="text-muted">Liveness</dt>
                                <dd className="font-semibold">
                                    {item.face?.livenessPassed ? 'passed' : 'failed'}
                                    {item.face?.steps ? ` (${item.face.steps.join(' → ')})` : ''}
                                </dd>
                                <dt className="text-muted">Real photo</dt>
                                <dd className="font-semibold">{pct(item.face?.real)}</dd>
                            </dl>
                            {item.reasons?.length ? <p className="text-xs text-muted">Flags: {item.reasons.join(', ')}</p> : null}
                            <fieldset className="flex flex-col gap-2 rounded-xl bg-paper p-3">
                                <legend className="sr-only">Seen in person</legend>
                                {DOCUMENT_CHECKS.map((check) => (
                                    <label key={check.key} className="flex min-h-10 cursor-pointer items-start gap-3 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={ticked.includes(check.key)}
                                            onChange={() => toggle(item.captainId, check.key)}
                                            className="mt-0.5 h-5 w-5 shrink-0 accent-ink"
                                        />
                                        {check.label}
                                    </label>
                                ))}
                            </fieldset>
                            <Decision
                                busy={busyId === `${item.captainId}-identity`}
                                approveDisabled={ticked.length < DOCUMENT_CHECKS.length}
                                onDecide={(decision) => decide(item.captainId, 'identity', decision)}
                            />
                        </article>
                    );
                })}
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Women captain checks ({queue?.gender?.length ?? '…'})</h2>
                <p className="text-xs text-muted">
                    Confirms captains who chose &quot;woman&quot; before they can use women-only features. While every captain is reviewed by a person, these come here too; please
                    look at the photo, not just the score.
                </p>
                {queue?.gender?.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : null}
                {queue?.gender?.map((item) => (
                    <article key={item.captainId} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                        <img src={item.image} alt="Live photo" className="h-24 w-24 rounded-xl object-cover" />
                        <div className="flex flex-1 flex-col gap-2">
                            <strong>
                                {item.name?.firstname} {item.name?.lastname} · {item.vehicle?.plate}
                            </strong>
                            <span className="text-xs text-muted">
                                Declared {item.declared} · model: {item.estimate || 'unknown'} ({pct(item.pFemale)} woman)
                                {item.reason === 'model_disagrees' ? ' · ⚠ model disagrees' : ''}
                            </span>
                            <Decision busy={busyId === `${item.captainId}-gender`} onDecide={(decision) => decide(item.captainId, 'gender', decision)} />
                        </div>
                    </article>
                ))}
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Shift face checks ({queue?.shifts.length ?? '…'})</h2>
                {queue?.shifts.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : null}
                {queue?.shifts.map((item) => (
                    <article key={item.captainId} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line">
                        <img src={item.image} alt="Shift selfie" className="h-24 w-24 rounded-xl object-cover" />
                        <div className="flex flex-1 flex-col gap-2">
                            <strong>
                                {item.name?.firstname} · {item.vehicle?.plate}
                            </strong>
                            <span className="text-xs text-muted">
                                Match {pct(item.score)} · {item.attempts} tries · window {item.windowId}
                                {item.reason ? ` · ${item.reason}` : ''}
                            </span>
                            <Decision busy={busyId === `${item.captainId}-shift`} onDecide={(decision) => decide(item.captainId, 'shift', decision)} />
                        </div>
                    </article>
                ))}
            </section>
        </div>
    );
}

export default function AdminReview() {
    const [key, setKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || '');
    const [draftKey, setDraftKey] = useState('');
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('alerts');
    const [alertCount, setAlertCount] = useState(null);
    const [checkCount, setCheckCount] = useState(null);

    const signOut = useCallback(() => {
        sessionStorage.removeItem(KEY_STORAGE);
        setKey('');
        setError('Wrong admin key.');
    }, []);

    // "(2) Safety alerts" in the browser tab, visible from other tabs.
    useEffect(() => {
        document.title = alertCount ? `(${alertCount}) Safety alerts · SwiftRide` : 'SwiftRide team';
    }, [alertCount]);

    if (!key) {
        return (
            <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 bg-paper p-6">
                <h1 className="font-display text-2xl font-semibold">SwiftRide team</h1>
                {error ? <p className="text-sm text-signal">{error}</p> : null}
                <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        sessionStorage.setItem(KEY_STORAGE, draftKey);
                        setError(null);
                        setKey(draftKey);
                    }}
                >
                    <label className="label" htmlFor="adminKey">
                        Admin key
                    </label>
                    <input id="adminKey" type="password" className="field" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} required />
                    <button className="btn-primary">Open</button>
                </form>
            </main>
        );
    }

    const tabs = [
        { id: 'alerts', label: 'Safety alerts', count: alertCount, urgent: true },
        { id: 'checks', label: 'Captain checks', count: checkCount },
    ];

    return (
        <main className="min-h-full bg-paper p-5">
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
                <h1 className="font-display text-2xl font-semibold">SwiftRide team</h1>
                <div role="tablist" aria-label="Sections" className="grid grid-cols-2 gap-2">
                    {tabs.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.id}
                            onClick={() => setTab(item.id)}
                            className={`flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-semibold ${tab === item.id ? 'bg-ink text-white' : 'bg-white ring-1 ring-line'}`}
                        >
                            {item.label}
                            {item.count ? (
                                <span className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs ${item.urgent ? 'bg-signal text-white' : 'bg-volt text-ink'}`}>
                                    {item.count}
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
                {/* Both stay mounted so alerts keep being checked on the other tab. */}
                <div hidden={tab !== 'alerts'}>
                    <SafetyAlerts adminKey={key} onUnauthorized={signOut} onCount={setAlertCount} />
                </div>
                <div hidden={tab !== 'checks'}>
                    <CaptainChecks adminKey={key} onUnauthorized={signOut} onCount={setCheckCount} />
                </div>
            </div>
        </main>
    );
}
