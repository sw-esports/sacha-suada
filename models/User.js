const { Schema, model } = require('mongoose');

const userSchema = new Schema({
    username: { type: String, required: true },
    vendorName: { type: String},
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    address: { type: String },
    contact: { type: String },
    city: { type: String },
    role: { type: String},
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const User = model('User', userSchema);

module.exports = User;
