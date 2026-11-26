// Official licence (Sarathi) and vehicle registration (Vahan) checks.
//
// Only a TEST provider exists for now: it validates formats and returns
// realistic-looking records so the whole flow can be built and tested. When
// SwiftRide signs up with DigiLocker or a licensed KYC provider, add an
// adapter with the same two functions and set VERIFICATION_PROVIDER.
//
// Never scrape parivahan.gov.in — it breaks their terms of use.

const PROVIDER = process.env.VERIFICATION_PROVIDER || 'test';

// "WB0120110012345", "WB-01 2011 0012345", "MH12 20190012345" → state + RTO + year + serial
const DL_PATTERN = /^([A-Z]{2})[-\s]?(\d{2})[-\s]?(\d{4})[-\s]?(\d{7})$/;
const PLATE_PATTERN = /^([A-Z]{2})\s?(\d{1,2})\s?([A-Z]{0,3})\s?(\d{1,4})$/;

const VEHICLE_CLASSES = {
    moto: ['MCWG', 'MCWOG'],
    bike: ['MCWG', 'MCWOG'],
    auto: ['3W-T', 'TR'],
    car: ['LMV-TR', 'TR', 'LMV'],
};

function normalise(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const testProvider = {
    name: 'test',

    async verifyDrivingLicence({ number, dob, name }) {
        const compact = normalise(number);
        const match = compact.match(/^([A-Z]{2})(\d{2})(\d{4})(\d{7})$/);
        if (!match) {
            return { valid: false, reason: 'invalid_format' };
        }
        const issueYear = Number(match[3]);
        return {
            valid: true,
            number: compact,
            name: name || 'TEST DRIVER',
            dob,
            issuedOn: `${issueYear}-01-15`,
            // Test licences are valid for 20 years from issue.
            validUntil: `${issueYear + 20}-01-14`,
            classes: ['MCWG', 'LMV', '3W-T', 'LMV-TR', 'TR'],
            source: 'test',
        };
    },

    async verifyVehicle({ plate, vehicleType }) {
        const compact = normalise(plate);
        if (!PLATE_PATTERN.test(compact)) {
            return { valid: false, reason: 'invalid_format' };
        }
        const year = new Date().getFullYear();
        return {
            valid: true,
            plate: compact,
            vehicleClass: (VEHICLE_CLASSES[vehicleType] || ['LMV-TR'])[0],
            commercial: true,
            fitnessUpto: `${year + 2}-12-31`,
            insuranceUpto: `${year + 1}-06-30`,
            permitUpto: `${year + 3}-03-31`,
            source: 'test',
        };
    },
};

const providers = { test: testProvider };

function getProvider() {
    const provider = providers[PROVIDER];
    if (!provider) {
        throw new Error(`Verification provider "${PROVIDER}" is not configured.`);
    }
    return provider;
}

module.exports = { getProvider, DL_PATTERN, PLATE_PATTERN, VEHICLE_CLASSES, normalise };
