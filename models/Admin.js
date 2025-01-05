const { Schema, model } = require('mongoose');

const adminSchema = new Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const Admin = model('Admin', adminSchema);

module.exports = Admin;
