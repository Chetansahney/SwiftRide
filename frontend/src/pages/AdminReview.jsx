import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '../lib/api';

const KEY_STORAGE = 'swiftrideAdminKey';
const pct = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`);

// Team-only review queue for verifications the face engine wasn't sure about.
// English only; protected by the ADMIN_KEY on the server.
export default function AdminReview() {
    const [key, setKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || '');
    const [draftKey, setDraftKey] = useState('');
    const [queue, setQueue] = useState(null);
    const [error, setError] = useState(null);
    const [busyId, setBusyId] = useState(null);

    const headers = useCallback(() => ({ headers: { 'x-admin-key': key } }), [key]);

    const load = useCallback(() => {
        if (!key) return;
        axios
            .get(`${API}/admin/verifications`, headers())
            .then(({ data }) => {
                setQueue(data);
                setError(null);
            })
            .catch((err) => {
                setError(err.response?.status === 401 ? 'Wrong admin key.' : err.response?.data?.message || 'Could not load the queue.');
                if (err.response?.status === 401) {
                    sessionStorage.removeItem(KEY_STORAGE);
                    setKey('');
                }
            });
    }, [key, headers]);

    useEffect(load, [load]);

    const decide = async (captainId, kind, decision) => {
        setBusyId(`${captainId}-${kind}`);
        try {
            await axios.post(`${API}/admin/verifications/${captainId}`, { kind, decision }, headers());
            load();
        } catch (err) {
            setError(err.response?.data?.message || 'Could not save the decision.');
        } finally {
            setBusyId(null);
        }
    };

    if (!key) {
        return (
            <main className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 bg-paper p-6">
                <h1 className="font-display text-2xl font-semibold">Verification review</h1>
                {error ? <p className="text-sm text-signal">{error}</p> : null}
                <form
                    className="flex flex-col gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        sessionStorage.setItem(KEY_STORAGE, draftKey);
                        setKey(draftKey);
                    }}
                >
                    <label className="label" htmlFor="adminKey">
                        Admin key
                    </label>
                    <input id="adminKey" type="password" className="field" value={draftKey} onChange={(e) => setDraftKey(e.target.value)} required />
                    <button className="btn-primary">Open queue</button>
                </form>
            </main>
        );
    }

    const Actions = ({ id, kind }) => (
        <div className="flex gap-2">
            <button type="button" disabled={busyId === `${id}-${kind}`} onClick={() => decide(id, kind, 'approve')} className="h-11 flex-1 rounded-xl bg-volt font-semibold text-ink disabled:opacity-50">
                Approve
            </button>
            <button type="button" disabled={busyId === `${id}-${kind}`} onClick={() => decide(id, kind, 'reject')} className="h-11 flex-1 rounded-xl bg-signal font-semibold text-white disabled:opacity-50">
                Reject
            </button>
        </div>
    );

    return (
        <main className="min-h-full bg-paper p-5">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
                <header className="flex items-center justify-between">
                    <h1 className="font-display text-2xl font-semibold">Verification review</h1>
                    <button type="button" onClick={load} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
                        Refresh
                    </button>
                </header>
                {error ? <p className="rounded-xl bg-signal/10 p-3 text-sm text-signal">{error}</p> : null}

                <section className="flex flex-col gap-3">
                    <h2 className="text-lg font-semibold">New captains ({queue?.identity.length ?? '…'})</h2>
                    {queue?.identity.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : null}
                    {queue?.identity.map((item) => (
                        <article key={item.captainId} className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-line">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <strong>
                                    {item.name?.firstname} {item.name?.lastname} · {item.vehicle?.plate}
                                </strong>
                                <span className="text-xs text-muted">{new Date(item.submittedAt).toLocaleString()}</span>
                            </div>
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
                                <dt className="text-muted">Head turn</dt>
                                <dd className="font-semibold">{item.face?.livenessPassed ? 'passed' : 'failed'}</dd>
                                <dt className="text-muted">Real photo</dt>
                                <dd className="font-semibold">{pct(item.face?.real)}</dd>
                            </dl>
                            {item.reasons?.length ? <p className="text-xs text-muted">Flags: {item.reasons.join(', ')}</p> : null}
                            <Actions id={item.captainId} kind="identity" />
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
                                </span>
                                <Actions id={item.captainId} kind="shift" />
                            </div>
                        </article>
                    ))}
                </section>
            </div>
        </main>
    );
}
