import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BadgeCheck, Camera, Clock, ShieldAlert } from 'lucide-react';
import AuthLayout, { FormError, FullScreenLoader } from '../components/ui/AuthLayout';
import FaceCapture from '../components/captain/FaceCapture';
import { useLanguage } from '../i18n/LanguageContext';
import { API, captainAuth } from '../lib/api';
import { compressFile } from '../lib/images';
import { STEP_PROMPTS } from '../lib/faceSteps';

const STEPS = ['verify.stepLicence', 'verify.stepFace', 'verify.stepDone'];

// One-time identity check after captain sign-up: licence details + photo,
// then a three-photo face check matched against the licence photo.
export default function CaptainVerify() {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const fileRef = useRef(null);
    const [step, setStep] = useState('loading'); // loading | licence | face | sending | result
    const [verification, setVerification] = useState(null);
    const [form, setForm] = useState({ dlNumber: '', dob: '', dlName: '' });
    const [dlImage, setDlImage] = useState(null);
    const [error, setError] = useState(null);
    // Random actions from the server for this attempt (single use, expires in 5 minutes).
    const [challenge, setChallenge] = useState(null);

    const newChallenge = async () => {
        setChallenge(null);
        try {
            const { data } = await axios.post(`${API}/captains/liveness-challenge`, { purpose: 'verification' }, captainAuth());
            setChallenge(data);
        } catch {
            setError(t('shift.unavailable'));
        }
    };

    useEffect(() => {
        axios
            .get(`${API}/captains/verification`, captainAuth())
            .then(({ data }) => {
                setVerification(data.verification);
                setStep(['verified', 'in_review'].includes(data.verification.status) ? 'result' : 'licence');
            })
            .catch(() => setStep('licence'));
    }, []);

    const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });

    const handleLicencePhoto = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) setDlImage(await compressFile(file, { maxSide: 1280, quality: 0.85 }));
    };

    const licenceReady = form.dlNumber.replace(/[^A-Za-z0-9]/g, '').length >= 15 && form.dob && dlImage;

    const submit = async (selfies, capture) => {
        setStep('sending');
        setError(null);
        try {
            const { data } = await axios.post(
                `${API}/captains/verification`,
                { ...form, dlImage, selfies, capture, challengeId: challenge?.challengeId },
                captainAuth()
            );
            setVerification(data.verification);
            setStep('result');
        } catch (err) {
            const reason = err.response?.data?.reason;
            setError(err.response?.status === 503 ? t('shift.unavailable') : reason ? t(`verify.reason.${reason}`) : t('verify.reason.bad_image'));
            setStep('face');
            newChallenge();
        }
    };

    if (step === 'loading') return <FullScreenLoader label={t('loading')} />;

    const stepIndex = { licence: 0, face: 1, sending: 1, result: 2 }[step];

    return (
        <AuthLayout badge="Captain" title={t('verify.title')} subtitle={step === 'licence' ? t('verify.intro') : undefined}>
            <ol className="mb-6 grid grid-cols-3 gap-2" aria-label={t('verify.title')}>
                {STEPS.map((key, index) => (
                    <li key={key} aria-current={index === stepIndex ? 'step' : undefined} className="flex flex-col gap-1.5">
                        <span className={`h-1.5 rounded-full ${index <= stepIndex ? 'bg-ink' : 'bg-line'}`} />
                        <span className={`text-xs font-semibold ${index === stepIndex ? 'text-ink' : 'text-muted'}`}>{t(key)}</span>
                    </li>
                ))}
            </ol>

            {step === 'licence' ? (
                <form
                    className="flex flex-col"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (licenceReady) {
                            setStep('face');
                            newChallenge();
                        }
                    }}
                >
                    <label className="label" htmlFor="dlNumber">
                        {t('verify.dlNumber')}
                    </label>
                    <input id="dlNumber" required className="field uppercase" autoComplete="off" placeholder="WB0120110012345" value={form.dlNumber} onChange={update('dlNumber')} aria-describedby="dlHint" />
                    <span id="dlHint" className="mb-5 mt-1.5 text-xs text-muted">
                        {t('verify.dlNumberHint')}
                    </span>
                    <div className="mb-5 grid grid-cols-2 gap-3">
                        <div>
                            <label className="label" htmlFor="dob">
                                {t('verify.dob')}
                            </label>
                            <input id="dob" required className="field" type="date" max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={update('dob')} />
                        </div>
                        <div>
                            <label className="label" htmlFor="dlName">
                                {t('verify.dlName')}
                            </label>
                            <input id="dlName" className="field uppercase" autoComplete="name" value={form.dlName} onChange={update('dlName')} />
                        </div>
                    </div>
                    <span className="label">{t('verify.dlPhoto')}</span>
                    <p className="mb-3 text-xs text-muted">{t('verify.dlPhotoHint')}</p>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleLicencePhoto} />
                    {dlImage ? (
                        <div className="mb-7 flex items-center gap-3">
                            <img src={dlImage} alt={t('verify.dlPhoto')} className="h-24 w-36 rounded-xl object-cover ring-1 ring-line" />
                            <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost flex-1">
                                {t('verify.retake')}
                            </button>
                        </div>
                    ) : (
                        <button type="button" onClick={() => fileRef.current?.click()} className="mb-7 flex h-24 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink/30 bg-white text-base font-semibold">
                            <Camera size={22} aria-hidden="true" />
                            {t('verify.takePhoto')}
                        </button>
                    )}
                    <button className="btn-primary" disabled={!licenceReady}>
                        {t('verify.next')}
                    </button>
                </form>
            ) : null}

            {step === 'face' ? (
                <div className="flex flex-col gap-4">
                    <FormError message={error} />
                    {challenge ? <FaceCapture key={challenge.challengeId} steps={challenge.steps} onDone={submit} /> : <p className="text-sm text-muted">{t('loading')}</p>}
                    <button type="button" onClick={() => setStep('licence')} className="btn-ghost">
                        {t('verify.back')}
                    </button>
                </div>
            ) : null}

            {step === 'sending' ? (
                <div className="flex flex-col items-center gap-4 py-10 text-center" role="status">
                    <span className="h-1.5 w-28 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                        <span className="block h-full w-1/3 animate-ride-load rounded-full bg-ink" />
                    </span>
                    <p className="text-base font-medium">{t('verify.checking')}</p>
                </div>
            ) : null}

            {step === 'result' && verification ? (
                <Result
                    verification={verification}
                    t={t}
                    onRetry={() => {
                        // Licence details are kept; a failed face check goes straight back to the camera.
                        const faceOnly = (verification.reasons || []).every((r) => ['liveness_failed', 'selfie_unclear', 'multiple_faces', 'no_face_selfie'].includes(r));
                        if (faceOnly) {
                            setStep('face');
                            newChallenge();
                        } else setStep('licence');
                    }}
                    onHome={() => navigate('/captainhome')}
                />
            ) : null}
        </AuthLayout>
    );
}

function Result({ verification, t, onRetry, onHome }) {
    const { status, reasons = [] } = verification;
    const view = {
        verified: { Icon: BadgeCheck, tone: 'bg-volt text-ink', title: 'verify.verified', body: 'verify.verifiedBody' },
        in_review: { Icon: Clock, tone: 'bg-ink text-volt', title: 'verify.review', body: 'verify.reviewBody' },
        rejected: { Icon: ShieldAlert, tone: 'bg-signal text-white', title: 'verify.rejected' },
    }[status] || { Icon: ShieldAlert, tone: 'bg-ink text-white', title: 'verify.banner' };
    const shown = status === 'rejected' ? reasons : [];

    return (
        <div className="flex flex-col gap-5" role="status">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
                <span className={`flex h-16 w-16 items-center justify-center rounded-full ${view.tone}`} aria-hidden="true">
                    <view.Icon size={32} />
                </span>
                <h2 className="font-display text-2xl font-semibold">{t(view.title)}</h2>
                {view.body ? <p className="text-base text-muted">{t(view.body)}</p> : null}
                {status !== 'rejected' && verification.genderCheck === 'in_review' ? (
                    <p className="rounded-[14px] bg-ink/5 px-4 py-3 text-sm">{t('captain.womanReview')}</p>
                ) : null}
            </div>
            {shown.length ? (
                <ul className="flex flex-col gap-2">
                    {shown.map((reason) => (
                        <li key={reason} className="rounded-[14px] bg-signal/10 px-4 py-3 text-sm font-medium text-signal">
                            {reason === 'liveness_failed' && STEP_PROMPTS[verification.failedStep]
                                ? t('verify.failedAt', { step: t(STEP_PROMPTS[verification.failedStep]) })
                                : t(`verify.reason.${reason}`)}
                        </li>
                    ))}
                </ul>
            ) : null}
            {status === 'rejected' ? (
                <button type="button" onClick={onRetry} className="btn-primary">
                    {t('verify.tryAgain')}
                </button>
            ) : null}
            <button type="button" onClick={onHome} className={status === 'rejected' ? 'btn-ghost' : 'btn-primary'}>
                {t('verify.goHome')}
            </button>
        </div>
    );
}
