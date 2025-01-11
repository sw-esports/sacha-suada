const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    type: { type: String, required: true },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
});

const userSchema = new mongoose.Schema({
    username: { type: String, required: true },
    vendorName: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    address: { type: String },
    contact: { type: String },
    city: { type: String },
    role: { type: String },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    foodType: { type: String },
    avgFoodQuantity: { type: String },
    typicalTime: { type: String },
    packagingAvailable: { type: String },
    notePackaging: { type: String },
    zomatoAvailability: { type: String },
    governmentCertificate: { type: String },
    foodSafetyGuidelines: { type: String },
    additionalDetails: { type: String },
    preferredTimeSlots: { type: String },
    maxDistance: { type: String },
    transportationAvailable: { type: String },
    targetBeneficiaries: { type: String },
    sustainabilityCertificates: { type: String },
    avgPeople: { type: String },
    profilePicture: { type: String, default: 'default.png' },
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
    notifications: [notificationSchema],
});

module.exports = mongoose.model('User', userSchema);
