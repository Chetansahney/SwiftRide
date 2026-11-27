// Simple, widely recognised woman pictogram (head and dress) used for the
// "I'm a woman travelling" toggle and women-captain badges.
export default function WomanIcon({ size = 24, className = '' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
            <circle cx="12" cy="4.6" r="2.6" />
            <path d="M12 8.2c-1.8 0-3.1 1.1-3.6 2.8L6.3 17.6c-.2.6.3 1.2.9 1.2h2.3V22c0 .6.4 1 1 1s1-.4 1-1v-3.2h1V22c0 .6.4 1 1 1s1-.4 1-1v-3.2h2.3c.6 0 1.1-.6.9-1.2L15.6 11c-.5-1.7-1.8-2.8-3.6-2.8Z" />
        </svg>
    );
}
