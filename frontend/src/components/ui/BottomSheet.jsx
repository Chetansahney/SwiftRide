import { X } from 'lucide-react';

// Modal sheet that slides up over everything with a dimmed backdrop.
export default function BottomSheet({ open, onClose, title, children, dark = false, dismissable = true, labelledBy }) {
    return (
        <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
            <div
                className={`absolute inset-0 bg-ink/50 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
                onClick={dismissable ? onClose : undefined}
                aria-hidden="true"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={labelledBy ? undefined : title}
                aria-labelledby={labelledBy}
                className={`absolute inset-x-0 bottom-0 mx-auto flex max-h-[88%] max-w-xl flex-col gap-4 overflow-y-auto rounded-t-sheet px-5 pb-8 pt-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${dark ? 'border-t border-night-line bg-night text-white' : 'bg-white text-ink shadow-sheet'} ${open ? 'translate-y-0' : 'translate-y-full shadow-none'}`}
            >
                {title ? (
                    <div className="flex items-start justify-between gap-3">
                        <h2 className="font-display text-xl font-semibold leading-snug">{title}</h2>
                        {dismissable ? (
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close"
                                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${dark ? 'bg-night-card' : 'bg-paper'}`}
                            >
                                <X size={20} aria-hidden="true" />
                            </button>
                        ) : null}
                    </div>
                ) : null}
                {children}
            </div>
        </div>
    );
}
