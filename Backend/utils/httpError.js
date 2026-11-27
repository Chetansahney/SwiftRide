// An error with an HTTP status and a message that is safe to show the user.
class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

module.exports = { HttpError };
