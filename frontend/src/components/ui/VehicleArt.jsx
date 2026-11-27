// Side-view drawings of the three vehicle types, all facing right.
// Drawn rather than photographed so they read clearly at small sizes and for
// first-time smartphone users.

function Bike() {
    return (
        <>
            <path d="M14 30 Q20 26 28 27" stroke="#5B606B" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="16" cy="38" r="10" fill="none" stroke="#0E0F12" strokeWidth="4" />
            <circle cx="16" cy="38" r="2.5" fill="#8A8F99" />
            <circle cx="64" cy="38" r="10" fill="none" stroke="#0E0F12" strokeWidth="4" />
            <circle cx="64" cy="38" r="2.5" fill="#8A8F99" />
            <path d="M16 38 L32 30" stroke="#5B606B" strokeWidth="3" strokeLinecap="round" />
            <path d="M64 38 L55 16" stroke="#8A8F99" strokeWidth="3" strokeLinecap="round" />
            <path d="M51 14 L59 12" stroke="#0E0F12" strokeWidth="3" strokeLinecap="round" />
            <rect x="31" y="27" width="17" height="10" rx="2" fill="#5B606B" />
            <path d="M30 25 Q36 17 48 19 L53 26 H30Z" fill="#C2554A" />
            <path d="M18 24 H34 Q36 24 35 26 L32 28 H20 Q17 28 18 24Z" fill="#0E0F12" />
            <circle cx="57" cy="20" r="3" fill="#F2C94C" />
        </>
    );
}

function Auto() {
    return (
        <g transform="translate(80 0) scale(-1 1)">
            <path d="M20 6 H62 Q70 6 70 14 V31 H16 V12 Q16 6 20 6Z" fill="#E3B341" />
            <path d="M16 13 L7 31 L5 41 H16Z" fill="#2B2E34" />
            <path d="M16 15 L10 29 H16Z" fill="#9FB4C8" />
            <rect x="34" y="12" width="30" height="17" rx="2" fill="#3A3D44" />
            <rect x="38" y="20" width="22" height="7" rx="2" fill="#5B606B" />
            <rect x="14" y="30" width="60" height="11" rx="3" fill="#2B2E34" />
            <rect x="14" y="30" width="60" height="2.5" fill="#E3B341" />
            <circle cx="11" cy="43" r="6" fill="#0E0F12" />
            <circle cx="11" cy="43" r="2.5" fill="#8A8F99" />
            <circle cx="63" cy="43" r="6" fill="#0E0F12" />
            <circle cx="63" cy="43" r="2.5" fill="#8A8F99" />
        </g>
    );
}

function Cab() {
    return (
        <>
            <path
                d="M4 37 Q4 31 10 30 L22 28 L30 19 Q32 17 36 17 H54 Q58 17 61 20 L68 28 Q76 29 76 35 V39 H4Z"
                fill="#FFFFFF"
                stroke="#C9CED6"
                strokeWidth="1"
            />
            <path d="M32 21 Q33 20 36 20 H45 V28 H25Z" fill="#8FA6BE" />
            <path d="M48 20 H53 Q56 20 58 22 L64 28 H48Z" fill="#8FA6BE" />
            <rect x="71" y="31" width="5" height="3" rx="1" fill="#F2C94C" />
            <rect x="4" y="31" width="3" height="3" rx="1" fill="#C9353B" />
            <circle cx="19" cy="40" r="6.5" fill="#0E0F12" />
            <circle cx="19" cy="40" r="2.8" fill="#B8BEC7" />
            <circle cx="61" cy="40" r="6.5" fill="#0E0F12" />
            <circle cx="61" cy="40" r="2.8" fill="#B8BEC7" />
        </>
    );
}

const ART = { bike: Bike, auto: Auto, cab: Cab };

export default function VehicleArt({ art = 'cab', width = 64, className = '' }) {
    const Drawing = ART[art] || Cab;
    return (
        <svg
            width={width}
            height={Math.round((width * 52) / 80)}
            viewBox="0 0 80 52"
            className={className}
            aria-hidden="true"
        >
            <Drawing />
        </svg>
    );
}
