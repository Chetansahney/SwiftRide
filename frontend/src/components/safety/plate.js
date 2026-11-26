// "wb02ak4417" → "WB 02 AK 4417" for messages and screen readers.
export function formatPlateText(plate) {
    if (!plate) return '';
    const compact = String(plate).toUpperCase().replace(/\s+/g, '');
    const match = compact.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
    return match ? `${match[1]} ${match[2]} ${match[3]} ${match[4]}` : compact;
}
