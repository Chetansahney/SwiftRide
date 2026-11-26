import { useRef, useState } from 'react';
import axios from 'axios';
import { Camera } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { API, captainAuth } from '../../lib/api';

const MAX_SIDE = 480;

// Shrinks the photo to a small JPEG before upload (keeps it well under the 300 KB limit).
function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = () => {
            const img = new Image();
            img.onerror = reject;
            img.onload = () => {
                const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.72));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// "Start your shift": captains take a selfie before they get ride requests, so
// riders can check the person who turns up is the one on the account.
export default function ShiftSelfieGate({ onDone }) {
    const { t } = useLanguage();
    const inputRef = useRef(null);
    const [preview, setPreview] = useState(null);
    const [status, setStatus] = useState('idle');

    const handleFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setStatus('uploading');
        try {
            const image = await compressImage(file);
            setPreview(image);
            const response = await axios.post(`${API}/captains/shift-selfie`, { image }, captainAuth());
            setStatus('idle');
            onDone(response.data.takenAt);
        } catch {
            setStatus('failed');
        }
    };

    return (
        <div className="flex flex-col gap-3 rounded-[18px] bg-night-card p-4">
            <div className="flex items-center gap-3">
                {preview ? (
                    <img src={preview} alt="" className="h-14 w-14 rounded-2xl object-cover" />
                ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-volt text-ink" aria-hidden="true">
                        <Camera size={26} />
                    </span>
                )}
                <div className="flex flex-col">
                    <strong className="font-display text-lg font-semibold">{t('captain.selfieTitle')}</strong>
                    <span className="text-xs leading-snug text-night-muted">{t('captain.selfieBody')}</span>
                </div>
            </div>
            <input ref={inputRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFile} />
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={status === 'uploading'}
                className="flex h-14 items-center justify-center gap-2 rounded-[14px] bg-volt text-base font-semibold text-ink disabled:opacity-60"
            >
                <Camera size={20} aria-hidden="true" />
                {status === 'uploading' ? t('captain.selfieUploading') : t('captain.selfieButton')}
            </button>
            {status === 'failed' ? (
                <p role="alert" className="text-sm text-[#FF8A8F]">
                    {t('captain.selfieFailed')}
                </p>
            ) : null}
        </div>
    );
}
