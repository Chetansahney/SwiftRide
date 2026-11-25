import { Link } from 'react-router-dom';
import { LanguageToggle, Logo } from './Brand';

// Shared shell for the four login / sign-up screens.
export default function AuthLayout({ title, subtitle, badge, children, footerLink }) {
    return (
        <div className="flex min-h-full flex-col bg-paper">
            <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-8 px-6 pb-8 pt-8">
                <div className="flex items-center justify-between">
                    <Link to="/" aria-label="SwiftRide home">
                        <Logo />
                    </Link>
                    <LanguageToggle />
                </div>

                <div className="flex flex-col gap-2">
                    {badge ? <span className="chip self-start bg-ink text-white">{badge}</span> : null}
                    <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight">{title}</h1>
                    {subtitle ? <p className="text-base text-muted">{subtitle}</p> : null}
                </div>

                <div className="flex-1">{children}</div>

                {footerLink ? (
                    <Link to={footerLink.to} className="btn-ghost">
                        {footerLink.label}
                    </Link>
                ) : null}
            </div>
        </div>
    );
}

export function FormError({ message }) {
    if (!message) return null;
    return (
        <p role="alert" className="mb-4 rounded-[14px] bg-signal/10 px-4 py-3 text-sm font-medium text-signal">
            {message}
        </p>
    );
}

export function FullScreenLoader({ dark = false, label }) {
    return (
        <div className={`flex h-full w-full flex-col items-center justify-center gap-4 ${dark ? 'bg-night text-white' : 'bg-paper text-ink'}`}>
            <Logo dark={dark} />
            <span className={`h-1.5 w-28 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-ink/10'}`} aria-hidden="true">
                <span className={`block h-full w-1/3 animate-ride-load rounded-full ${dark ? 'bg-volt' : 'bg-ink'}`} />
            </span>
            <span className="sr-only" role="status">
                {label}
            </span>
        </div>
    );
}
