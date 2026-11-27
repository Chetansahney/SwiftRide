// 10-digit Indian mobile with a fixed +91 in front.
export default function PhoneField({ id, value, onChange, required = false, dark = false, describedBy }) {
    return (
        <div className="relative">
            <span
                className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-semibold ${dark ? 'text-night-muted' : 'text-muted'}`}
                aria-hidden="true"
            >
                +91
            </span>
            <input
                id={id}
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={16}
                required={required}
                aria-describedby={describedBy}
                className={dark ? 'h-14 w-full rounded-[14px] bg-night pl-14 pr-4 text-base text-white outline-none ring-1 ring-night-edge placeholder:text-night-muted focus:ring-2 focus:ring-volt' : 'field pl-14'}
                value={value}
                onChange={(event) => onChange(event.target.value.replace(/[^\d\s+-]/g, ''))}
            />
        </div>
    );
}
