import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Mail, Phone, ShieldAlert, Trash2 } from 'lucide-react';
import { LanguageToggle } from '../components/ui/Brand';
import { useLanguage } from '../i18n/LanguageContext';
import { SUPPORT } from '../lib/config';

// Privacy Policy, Terms of Use and Help & support.
//
// The Privacy Policy and Terms are DRAFTS written from what the app actually
// does today, for a lawyer to review before public launch. Company details come
// from the VITE_* settings in lib/config.js; anything not set yet shows as a
// highlighted [placeholder].

const UPDATED = '27 November 2026';

// A detail that isn't set yet stays visible as a highlighted placeholder.
function Fill({ value, label }) {
    if (value) return <>{value}</>;
    return <mark className="rounded bg-volt/60 px-1 font-semibold text-ink">[{label}]</mark>;
}

const P = ({ children }) => <p>{children}</p>;
const List = ({ children }) => <ul className="flex list-disc flex-col gap-1.5 pl-5">{children}</ul>;

function LegalShell({ title, draft = false, children }) {
    const { t } = useLanguage();
    const navigate = useNavigate();
    // Opened in a new tab from sign-up there is no page to go back to.
    const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/'));
    return (
        <div className="min-h-full bg-paper">
            <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-12 pt-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={back}
                            aria-label={t('legal.back')}
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-float"
                        >
                            <ChevronLeft size={22} aria-hidden="true" />
                        </button>
                        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
                    </div>
                    <LanguageToggle />
                </div>
                {draft ? (
                    <p role="note" className="rounded-[14px] bg-volt px-4 py-3 text-sm font-semibold text-ink">
                        {t('legal.draft')}
                    </p>
                ) : null}
                {children}
                <nav aria-label={t('legal.support')} className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-2 text-sm font-semibold">
                    <Link to="/support" className="underline underline-offset-4">
                        {t('legal.support')}
                    </Link>
                    <Link to="/terms" className="underline underline-offset-4">
                        {t('legal.terms')}
                    </Link>
                    <Link to="/privacy" className="underline underline-offset-4">
                        {t('legal.privacy')}
                    </Link>
                </nav>
            </div>
        </div>
    );
}

function LegalDocument({ sections }) {
    const { t, lang } = useLanguage();
    return (
        <>
            {lang !== 'en' ? <p className="rounded-[14px] bg-white px-4 py-3 text-sm ring-1 ring-line">{t('legal.englishOnly')}</p> : null}
            <article lang="en" className="flex flex-col gap-6 rounded-[24px] bg-white p-5 text-[15px] leading-relaxed text-ink">
                <p className="text-xs text-muted">{t('legal.updated', { date: UPDATED })}</p>
                {sections.map((section) => (
                    <section key={section.title} className="flex flex-col gap-2">
                        <h2 className="font-display text-lg font-semibold">{section.title}</h2>
                        {section.body}
                    </section>
                ))}
            </article>
        </>
    );
}

const company = <Fill value={SUPPORT.company} label="Company legal name" />;
const supportEmail = <Fill value={SUPPORT.email} label="Support email" />;
const grievance = (
    <>
        <Fill value={SUPPORT.grievanceName} label="Grievance officer's name" />, <Fill value={SUPPORT.grievanceEmail || SUPPORT.email} label="Grievance officer's email" />
    </>
);

const PRIVACY = [
    {
        title: 'Who we are',
        body: (
            <P>
                SwiftRide (“we”) is run by {company}, <Fill value={SUPPORT.address} label="Registered address" />. We decide how the personal data described here is used, so
                under India’s Digital Personal Data Protection Act, 2023 we are its Data Fiduciary. Questions about your data: {supportEmail}.
            </P>
        ),
    },
    {
        title: 'What we collect',
        body: (
            <List>
                <li>
                    <strong>Account:</strong> your name, email, mobile number and password. The password is stored only as a one-way hash, never as text.
                </li>
                <li>
                    <strong>Rides:</strong> pickup and drop places, times, fares, payments recorded, tips, ratings, cancellations, and places you save such as Home and Work.
                </li>
                <li>
                    <strong>Location:</strong> your phone’s location while you use the app, to suggest pickups and find captains near you. Captains share their live location while
                    the app is open, and during a ride.
                </li>
                <li>
                    <strong>Safety:</strong> the trusted contacts you add (name and mobile number), your safety settings (such as “I’m a woman travelling”), SOS presses, answers to
                    “Are you okay?” check-ins, reports, and where you were when you raised them.
                </li>
                <li>
                    <strong>Captains, also:</strong> vehicle details; driving-licence details (name, date of birth, validity, vehicle classes, the last 4 digits of the number, and a
                    keyed fingerprint of the full number so one licence can’t be used on two accounts, but not the number itself); photos of the licence and live selfies; face
                    fingerprints computed from those photos; gender and whether a woman captain has been confirmed; the photo from each shift check; offers, earnings, ratings and
                    strikes.
                </li>
                <li>
                    <strong>Device:</strong> your login token is kept on your phone. Our servers keep short technical logs to run the service and keep it secure.
                </li>
                <li>We never ask for your Aadhaar number. We don’t use advertising trackers, and we don’t sell personal data.</li>
            </List>
        ),
    },
    {
        title: 'Why we use it',
        body: (
            <>
                <List>
                    <li>To book and run rides: match you with a nearby captain, show the route and arrival time, work out the fare, and record payment.</li>
                    <li>
                        For safety: verify captains, show riders who is coming, run shift face checks, the pickup PIN, live trip sharing, SOS and check-ins, and look into reports.
                    </li>
                    <li>To help you and settle disputes, for example about a fare.</li>
                    <li>To stop fraud and misuse, for example one licence on two accounts.</li>
                    <li>To meet legal duties, such as lawful requests from authorities.</li>
                </List>
                <P>
                    We use your data only for these purposes. When you create an account you agree to this use, and you can withdraw that consent at any time by deleting your
                    account.
                </P>
            </>
        ),
    },
    {
        title: 'Face data (captains only)',
        body: (
            <>
                <P>
                    When a captain signs up, we compare live selfies, taken while making random head movements to show it’s a real person, with the licence photo. We also estimate
                    gender from them, only to confirm women captains for women-only options. At the start of each shift we compare a new selfie with the verified one.
                </P>
                <List>
                    <li>Licence photos and sign-up selfies are kept only until a person on our team has reviewed them, then deleted.</li>
                    <li>Face fingerprints (a list of numbers, not a photo) are kept while the captain account exists, so shift checks work.</li>
                    <li>The latest shift photo is shown to riders during that shift, so they can check who is picking them up.</li>
                    <li>Face checks run on our own servers. We don’t send faces to other companies.</li>
                </List>
            </>
        ),
    },
    {
        title: 'Who can see your data',
        body: (
            <List>
                <li>
                    <strong>Your rider or captain, during a ride:</strong> first name; for captains also the vehicle, number plate and today’s shift photo. Mobile numbers are shown to
                    each other only from when the captain accepts until the ride ends, so you can call at pickup.
                </li>
                <li>
                    <strong>People you share your trip with:</strong> the live trip link shows your captain’s first name, vehicle, plate and location until the trip ends.
                </li>
                <li>
                    <strong>Our team:</strong> to review captains, handle safety alerts and help you. They see what that needs, for example phone numbers and trusted contacts when
                    handling an SOS.
                </li>
                <li>
                    <strong>Map services:</strong> to search places and work out routes, our servers send the text you type and map points (not your name or number) to services
                    built on OpenStreetMap: Photon (run by Komoot) and OSRM (run by FOSSGIS e.V.). Map images load in your browser from OpenFreeMap, which sees your internet
                    address like any website does.
                </li>
                <li>
                    <strong>Our hosting providers,</strong> who run the service for us: <Fill label="Hosting providers and where they store data" />.
                </li>
                <li>
                    <strong>Team chat:</strong> if we turn on chat alerts, they carry only the kind of alert and the time. No names, numbers or locations.
                </li>
                <li>
                    <strong>Authorities,</strong> when the law requires it.
                </li>
            </List>
        ),
    },
    {
        title: 'How long we keep it',
        body: (
            <List>
                <li>Your account and ride history: until you delete your account.</li>
                <li>Licence photos and sign-up selfies: until our team has reviewed them.</li>
                <li>
                    Safety alerts and reports: <Fill label="How long, decided with a lawyer" />, even after an account is deleted, because they may be needed to look into an incident
                    or by law.
                </li>
                <li>Login tokens: they expire after 24 hours.</li>
                <li>When a captain deletes their account, past rides stay in riders’ history without a link to the captain.</li>
            </List>
        ),
    },
    {
        title: 'Your rights',
        body: (
            <>
                <List>
                    <li>Get a summary of your personal data and how we use it.</li>
                    <li>Correct or update it. Most of it you can change on the Account page.</li>
                    <li>Erase it: delete your account at any time in the app (Account → Delete account). This also withdraws your consent.</li>
                    <li>Nominate someone to act for you if you die or can’t act yourself.</li>
                    <li>Complain to our grievance officer, and then to the Data Protection Board of India.</li>
                </List>
                <P>To use any of these rights, write to {supportEmail}.</P>
            </>
        ),
    },
    {
        title: 'Children',
        body: <P>SwiftRide is only for people aged 18 or older. We don’t knowingly collect data from anyone younger.</P>,
    },
    {
        title: 'Security',
        body: (
            <P>
                We use HTTPS, hash passwords, store licence numbers only as keyed fingerprints, delete review photos after review, and protect team screens with a secret key. No
                system is perfectly safe: if a breach affects you, we will tell you and the Data Protection Board as the law requires.
            </P>
        ),
    },
    {
        title: 'Changes',
        body: <P>We’ll show important changes in the app before they apply.</P>,
    },
    {
        title: 'Contact and grievances',
        body: (
            <P>
                Grievance officer: {grievance}. Support: {supportEmail}, <Fill value={SUPPORT.phone} label="Support phone" />.
            </P>
        ),
    },
];

const TERMS = [
    {
        title: 'About these terms',
        body: (
            <P>
                These terms are an agreement between you and {company} (“SwiftRide”). By creating an account or booking a ride, you accept them and our Privacy Policy.
            </P>
        ),
    },
    {
        title: 'What SwiftRide does',
        body: (
            <P>
                SwiftRide is a technology platform that connects riders with independent captains (drivers), who provide the ride. Captains are not SwiftRide employees.{' '}
                <Fill label="Aggregator licence number and issuing state" />.
            </P>
        ),
    },
    {
        title: 'Your account',
        body: (
            <List>
                <li>You must be 18 or older.</li>
                <li>Give true details, including a mobile number you use. One account per person.</li>
                <li>Keep your password private. You are responsible for what happens on your account.</li>
            </List>
        ),
    },
    {
        title: 'Fares',
        body: (
            <List>
                <li>The fare you see before booking is locked. The captain can’t change it or ask for more.</li>
                <li>
                    Shown separately before you book, the fare may include a return-trip fee (when the drop is far, or somewhere with few rides back; it goes fully to the captain)
                    and a night charge (20% of the ride fare, 10 pm to 6 am).
                </li>
                <li>Waiting: the first 3 minutes after the captain arrives are free, then ₹1 (bike), ₹1.50 (auto) or ₹2 (cab) a minute, up to ₹60.</li>
                <li>Tips are optional, up to ₹200, and go fully to the captain.</li>
            </List>
        ),
    },
    {
        title: 'Paying',
        body: (
            <P>
                You pay the captain directly, in cash or by UPI; the app records the payment. SwiftRide credit (from the Ride Guarantee or an approved refund) comes off your next
                fare automatically. It has no cash value and can’t be transferred.
            </P>
        ),
    },
    {
        title: 'Cancellations and the Ride Guarantee',
        body: (
            <List>
                <li>Riders can cancel free of charge before the ride starts.</li>
                <li>If a captain drops your ride after accepting it, we send it straight to other captains and add ₹50 SwiftRide credit to your account, up to 3 times a week.</li>
            </List>
        ),
    },
    {
        title: 'Safety',
        body: (
            <List>
                <li>Before you get in, check the captain’s photo, name, vehicle and number plate. Give your PIN only to your captain at pickup.</li>
                <li>
                    <strong>SwiftRide is not an emergency service. In an emergency, call 112.</strong> The SOS button alerts our team, who will try to help, but we can’t promise an
                    immediate response.
                </li>
                <li>Women-only options are offered only to captains whose gender our team has confirmed.</li>
            </List>
        ),
    },
    {
        title: 'Rules for everyone',
        body: (
            <List>
                <li>No harassment, threats, discrimination or violence.</li>
                <li>No asking for, or offering, money beyond the fare shown in the app.</li>
                <li>Follow traffic rules. Captains drive safely; riders on bikes wear the helmet.</li>
                <li>Ratings and reports must be honest. False reports can lead to suspension.</li>
            </List>
        ),
    },
    {
        title: 'Captains',
        body: (
            <List>
                <li>
                    You need a valid driving licence for your vehicle, its registration, insurance, fitness certificate and permit, and police verification. Our team checks the
                    originals before you can take rides.
                </li>
                <li>Each shift starts with a face check. Nobody else may drive on your account.</li>
                <li>You choose when to drive. While online, keep the app open so riders can see you coming.</li>
                <li>
                    Reports of asking for extra money or unsafe driving, and every third dropped ride, add a strike. Three strikes pause your account for review. Harassment or a
                    wrong-driver report pauses it straight away.
                </li>
                <li>
                    Platform fee and payouts: <Fill label="Captain fee and payout terms" />.
                </li>
            </List>
        ),
    },
    {
        title: 'Suspension and closing your account',
        body: <P>We may pause or close accounts that break these terms or put others at risk. You can delete your account at any time in the app.</P>,
    },
    {
        title: 'Our responsibility',
        body: (
            <P>
                We work to keep SwiftRide safe and working, but maps, arrival times and the app itself can sometimes be wrong or unavailable. Nothing in these terms limits your
                rights under the Consumer Protection Act, 2019, or any responsibility that the law doesn’t allow us to limit.
            </P>
        ),
    },
    {
        title: 'Disputes',
        body: (
            <P>
                Contact support first, then our grievance officer ({grievance}). We acknowledge complaints within 48 hours and aim to resolve them within one month. These terms
                follow the laws of India, and the courts at <Fill value={SUPPORT.city} label="City" /> handle disputes.
            </P>
        ),
    },
    {
        title: 'Changes to these terms',
        body: <P>We’ll tell you in the app before important changes apply.</P>,
    },
];

export function PrivacyPage() {
    const { t } = useLanguage();
    return (
        <LegalShell title={t('legal.privacy')} draft>
            <LegalDocument sections={PRIVACY} />
        </LegalShell>
    );
}

export function TermsPage() {
    const { t } = useLanguage();
    return (
        <LegalShell title={t('legal.terms')} draft>
            <LegalDocument sections={TERMS} />
        </LegalShell>
    );
}

function ContactRow({ icon, label, value, href, missing }) {
    const Icon = icon;
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paper" aria-hidden="true">
                <Icon size={18} />
            </span>
            <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted">{label}</span>
                {value ? (
                    <a href={href} className="truncate text-base font-semibold underline underline-offset-4">
                        {value}
                    </a>
                ) : (
                    <Fill label={missing} />
                )}
            </div>
        </div>
    );
}

export function SupportPage() {
    const { t } = useLanguage();
    const notSet = t('support.notSet');
    return (
        <LegalShell title={t('legal.support')}>
            <a href="tel:112" className="flex min-h-20 items-center gap-4 rounded-[24px] bg-signal p-5 text-white">
                <ShieldAlert size={28} className="shrink-0" aria-hidden="true" />
                <span className="flex flex-col">
                    <strong className="font-display text-xl font-semibold">{t('support.emergency')}</strong>
                    <span className="text-sm text-white/85">{t('support.emergencySub')}</span>
                </span>
            </a>
            <p className="rounded-[18px] bg-ink px-5 py-4 text-sm leading-relaxed text-white">{t('support.duringRide')}</p>

            <section className="flex flex-col gap-4 rounded-[24px] bg-white p-5">
                <h2 className="font-display text-lg font-semibold">{t('support.contact')}</h2>
                <ContactRow icon={Mail} label={t('support.email')} value={SUPPORT.email} href={`mailto:${SUPPORT.email}`} missing={notSet} />
                <ContactRow icon={Phone} label={t('support.phone')} value={SUPPORT.phone} href={`tel:${SUPPORT.phone.replace(/[^\d+]/g, '')}`} missing={notSet} />
            </section>

            <section className="flex flex-col gap-3 rounded-[24px] bg-white p-5">
                <h2 className="font-display text-lg font-semibold">{t('support.grievance')}</h2>
                <p className="text-sm leading-relaxed text-muted">{t('support.grievanceSub')}</p>
                <p className="text-base font-semibold">
                    <Fill value={SUPPORT.grievanceName} label={notSet} />
                </p>
                <ContactRow
                    icon={Mail}
                    label={t('support.email')}
                    value={SUPPORT.grievanceEmail || SUPPORT.email}
                    href={`mailto:${SUPPORT.grievanceEmail || SUPPORT.email}`}
                    missing={notSet}
                />
            </section>

            <p className="flex items-start gap-3 rounded-[18px] bg-white p-4 text-sm leading-relaxed">
                <Trash2 size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
                {t('support.deleteAccount', { account: t('account.title'), delete: t('account.delete') })}
            </p>
        </LegalShell>
    );
}
