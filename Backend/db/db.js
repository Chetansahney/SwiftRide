const mongoose = require('mongoose');

// Unknown fields in queries are ignored rather than matched literally.
mongoose.set('strictQuery', true);

function connectToDB() {
    return mongoose
        .connect(process.env.DB_CONNECT, { serverSelectionTimeoutMS: 10000, maxPoolSize: 20 })
        .then(() => console.log('Connected to DB'))
        .catch((error) => {
            console.error('Error connecting to DB:', error.message);
            process.exitCode = 1;
        });
}

module.exports = connectToDB;
