const crypto = require('crypto');

// Reviewers send the ADMIN_KEY env value in the x-admin-key header.
// Without ADMIN_KEY set, the admin routes are switched off.
module.exports.authAdmin = (req, res, next) => {
    const expected = process.env.ADMIN_KEY;
    if (!expected) return res.status(503).json({ message: 'Admin review is not configured.' });
    const given = Buffer.from(String(req.headers['x-admin-key'] || ''));
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
        return res.status(401).json({ message: 'unAuthorised' });
    }
    return next();
};
