const { body, validationResult } = require('express-validator');

// bcrypt only reads the first 72 bytes, so longer passwords are refused.
const passwordRule = (field = 'password') =>
    body(field)
        .isString()
        .isLength({ min: 8, max: 72 })
        .withMessage('Password should be 8 to 72 characters long')
        .matches(/[A-Za-z]/)
        .withMessage('Password should include a letter')
        .matches(/\d/)
        .withMessage('Password should include a number');

const emailRule = (field = 'email') =>
    body(field).isString().trim().isEmail().withMessage('Please enter a valid email address').isLength({ max: 254 }).toLowerCase();

const nameRule = (field, { optional = false } = {}) => {
    const rule = body(field);
    return (optional ? rule.optional({ values: 'falsy' }) : rule)
        .isString()
        .trim()
        .isLength({ min: 3, max: 40 })
        .withMessage('Name should be 3 to 40 characters long')
        .matches(/^[\p{L}\p{M} .'-]+$/u)
        .withMessage('Name can only contain letters');
};

// "+91 98765 43210" / "098765 43210" / "9876543210" → "9876543210"
const normalizePhone = (value) => String(value ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

// Indian mobile numbers. Not verified by SMS yet (no paid SMS provider).
const phoneRule = (field = 'phone', { optional = false } = {}) => {
    const rule = body(field);
    return (optional ? rule.optional({ values: 'falsy' }) : rule)
        .customSanitizer(normalizePhone)
        .matches(/^[6-9]\d{9}$/)
        .withMessage('Enter a 10-digit Indian mobile number');
};

// Login only checks shape; strength rules apply at sign-up so old accounts still work.
const loginRules = [
    body('email').isString().trim().isLength({ min: 3, max: 254 }).toLowerCase(),
    body('password').isString().isLength({ min: 1, max: 72 }),
];

// Stops the request with 400 and the list of problems, if any.
function validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array().map(({ msg, path }) => ({ msg, path })) });
    }
    return next();
}

module.exports = { passwordRule, emailRule, nameRule, phoneRule, normalizePhone, loginRules, validate };
