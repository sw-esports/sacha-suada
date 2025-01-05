const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Admin = require('./models/Admin');

mongoose.connect('mongodb://127.0.0.1:27017/food-donation-app', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(async () => {
    const hashedPassword = await bcrypt.hash('suraj', 10);
    const admin = new Admin({ username: 'suraj', email: 'lordsjmy@gmail.com', password: hashedPassword });
    await admin.save();
    console.log('Admin created');
    process.exit();
}).catch(err => console.error(err));
