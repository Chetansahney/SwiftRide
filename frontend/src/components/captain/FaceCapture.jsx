import { useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw, Upload } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { captureVideo, compressFile } from '../../lib/images';

const PROMPTS = ['verify.lookStraight', 'verify.turnLeft', 'verify.turnRight'];
const COUNTDOWN = 3;

// Three photos — straight, head turned left, head turned right — so a printed
// photo or a phone screen held up to the camera can't pass. Captures itself
// after a short countdown for each prompt; falls back to uploading selfies.
export default function FaceCapture({ onDone }) {
    const { t } = useLanguage();
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const fileRef = useRef(null);
    const [mode, setMode] = useState('intro'); // intro | camera | upload | review
    const [frames, setFrames] = useState([]);
    const [count, setCount] = useState(COUNTDOWN);

    const stop = () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
    };
    useEffect(() => stop, []);

    const start = async () => {
        setFrames([]);
        setCount(COUNTDOWN);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 } }, audio: false });
            streamRef.current = stream;
            setMode('camera');
        } catch {
            setMode('upload');
        }
    };

    // Attach the stream once the <video> is on screen.
    useEffect(() => {
        if (mode === 'camera' && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
            videoRef.current.play().catch(() => {});
        }
    }, [mode]);

    // Countdown → capture → next prompt.
    useEffect(() => {
        if (mode !== 'camera') return undefined;
        const timer = setTimeout(() => {
            if (count > 1) {
                setCount(count - 1);
                return;
            }
            const video = videoRef.current;
            if (!video?.videoWidth) {
                setCount(1);
                return;
            }
            const next = [...frames, captureVideo(video)];
            setFrames(next);
            setCount(COUNTDOWN);
            if (next.length === PROMPTS.length) {
                stop();
                setMode('review');
            }
        }, 1000);
        return () => clearTimeout(timer);
    }, [mode, count, frames]);

    const handleUpload = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const next = [...frames, await compressFile(file)];
        setFrames(next);
        if (next.length === PROMPTS.length) setMode('review');
    };

    const step = Math.min(frames.length, PROMPTS.length - 1);

    if (mode === 'intro') {
        return (
            <div className="flex flex-col gap-4">
                <p className="text-base leading-relaxed text-muted">{t('verify.faceIntro')}</p>
                <ol className="flex flex-col gap-2">
                    {PROMPTS.map((key, index) => (
                        <li key={key} className="flex items-center gap-3 rounded-[14px] bg-white px-4 py-3 ring-1 ring-line">
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-semibold text-volt">{index + 1}</span>
                            <span className="text-sm font-medium">{t(key)}</span>
                        </li>
                    ))}
                </ol>
                <button type="button" onClick={start} className="btn-primary flex items-center justify-center gap-2">
                    <Camera size={20} aria-hidden="true" />
                    {t('verify.start')}
                </button>
            </div>
        );
    }

    if (mode === 'review') {
        return (
            <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2">
                    {frames.map((frame, index) => (
                        <figure key={index} className="flex flex-col gap-1">
                            <img src={frame} alt={t(PROMPTS[index])} className="aspect-[3/4] w-full rounded-2xl object-cover" />
                            <figcaption className="text-center text-[11px] text-muted">{t('verify.photoOf', { n: index + 1 })}</figcaption>
                        </figure>
                    ))}
                </div>
                <button type="button" onClick={() => onDone(frames)} className="btn-primary">
                    {t('verify.next')}
                </button>
                <button type="button" onClick={start} className="btn-ghost flex items-center justify-center gap-2">
                    <RotateCcw size={18} aria-hidden="true" />
                    {t('verify.retake')}
                </button>
            </div>
        );
    }

    const prompt = (
        <div className="flex flex-col items-center gap-1 text-center" aria-live="assertive">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('verify.photoOf', { n: step + 1 })}</span>
            <strong className="font-display text-xl font-semibold leading-snug">{t(PROMPTS[step])}</strong>
        </div>
    );

    if (mode === 'upload') {
        return (
            <div className="flex flex-col gap-4">
                <p role="alert" className="rounded-[14px] bg-signal/10 px-4 py-3 text-sm font-medium text-signal">
                    {t('verify.cameraBlocked')}
                </p>
                {prompt}
                <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleUpload} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-primary flex items-center justify-center gap-2">
                    <Upload size={20} aria-hidden="true" />
                    {t('verify.uploadInstead')}
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {prompt}
            <div className="relative overflow-hidden rounded-[24px] bg-ink">
                {/* Mirrored like a mirror; the saved photo isn't. */}
                <video ref={videoRef} playsInline muted className="aspect-[3/4] w-full -scale-x-100 object-cover" />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
                    <div className="h-[62%] w-[62%] rounded-[50%] border-4 border-volt/80" />
                </div>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/80 px-4 py-2 text-white">
                    <span className="text-sm font-medium">{t('verify.hold')}</span>
                    <strong className="font-display text-xl text-volt">{count}</strong>
                </div>
            </div>
            <div className="flex justify-center gap-2" aria-hidden="true">
                {PROMPTS.map((key, index) => (
                    <span key={key} className={`h-2 w-8 rounded-full ${index < frames.length ? 'bg-ink' : index === frames.length ? 'bg-volt ring-1 ring-ink' : 'bg-line'}`} />
                ))}
            </div>
        </div>
    );
}
