// The one rule for women-only features: the captain declared female AND that
// was confirmed (face check, or a person on the review team).
function isConfirmedWoman(captain) {
    return captain?.gender === 'female' && captain?.genderCheck?.status === 'verified';
}

// Same rule as a MongoDB filter, for dispatch queries.
const CONFIRMED_WOMAN_FILTER = { gender: 'female', 'genderCheck.status': 'verified' };

module.exports = { isConfirmedWoman, CONFIRMED_WOMAN_FILTER };
