// Indian commercial vehicles carry yellow plates with black text, so the app shows
// the plate the same way riders will see it on the street.
function formatPlate(plate) {
    if (!plate) return '---';
    const compact = String(plate).toUpperCase().replace(/\s+/g, '');
    const match = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
    return match ? `${match[1]} ${match[2]} ${match[3]} ${match[4]}` : compact;
}

export default function NumberPlate({ plate, size = 'md' }) {
    const big = size === 'lg';
    return (
        <span
            className={`inline-block rounded-md border-2 border-ink bg-plate font-display font-bold tracking-wide text-ink ${big ? 'px-2.5 py-1 text-lg' : 'px-2 py-0.5 text-[15px]'}`}
        >
            {formatPlate(plate)}
        </span>
    );
}
