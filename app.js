const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const User = require('./models/User'); // User schema
const Admin = require('./models/Admin'); // Admin schema

const app = express();
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

// MongoDB connection
mongoose.connect('mongodb://127.0.0.1:27017/food-donation-app', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("Connection error", err);
});

// Secret key for JWT
const SECRET_KEY = "yourSuperSecretKey"; // Replace with an environment variable in production

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        req.isAuthenticated = false;
        return next();
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            req.isAuthenticated = false;
            return next();
        }
        req.isAuthenticated = true;
        req.user = user;
        next();
    });
};

app.use(authenticateToken); // Global middleware

app.get("/", (req, res) => {
    res.render("index", { isAuthenticated: req.isAuthenticated });
});

// Login routes
app.get("/login", (req, res) => {
    res.render("login", { isAuthenticated: req.isAuthenticated });
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).render('login', { error: "Invalid email or password", isAuthenticated: false });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).render('login', { error: "Invalid email or password", isAuthenticated: false });
        }

        const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).render('login', { error: "An error occurred. Please try again later.", isAuthenticated: false });
    }
});

// Register routes
app.get("/register", (req, res) => {
    res.render("register", { isAuthenticated: req.isAuthenticated });
});

app.post("/register", async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;

    if (password !== confirmPassword) {
        return res.status(400).render('register', { error: "Passwords do not match", isAuthenticated: false });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).render('register', { error: "Email already exists", isAuthenticated: false });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, email, password: hashedPassword });
        await user.save();

        const token = jwt.sign({ id: user._id }, SECRET_KEY, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/user-role');
    } catch (error) {
        console.error(error);
        res.status(500).render('register', { error: "An error occurred. Please try again later.", isAuthenticated: false });
    }
});

// User role selection
app.get("/user-role", (req, res) => {
    if(req.isAuthenticated){
        res.render("user-role", { isAuthenticated: req.isAuthenticated });
    }
    else{
        res.redirect('/login');
    }
});

app.post("/user-role", async (req, res) => {
    const { role, contact, city, address, vendorName } = req.body;

    try {
        // Update the user document with the additional fields
        await User.findByIdAndUpdate(req.user.id, { role, contact, city, address, vendorName });

        // Redirect to the dashboard upon successful update
        res.redirect('/dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: "An error occurred", isAuthenticated: req.isAuthenticated });
    }
   
});


// Protected dashboard route
app.get('/dashboard', authenticateToken, async (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    try {
        const currentUser = await User.findById(req.user.id).select('-password');
        
        // Find opposite roles
        let oppositeUsers;
        if (currentUser.role === 'restaurant') {
            oppositeUsers = await User.find({ role: 'ngo' }).select('-password');
        } else if (currentUser.role === 'ngo') {
            oppositeUsers = await User.find({ role: 'restaurant' }).select('-password');
        } else {
            oppositeUsers = [];
        }

        res.render('dashboard', { currentUser, oppositeUsers, isAuthenticated: req.isAuthenticated });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: "An error occurred", isAuthenticated: req.isAuthenticated });
    }
});


// Logout route
app.get('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// Admin login routes
app.get('/admin-login', (req, res) => {
    res.render('admin-login', { isAuthenticated: req.isAuthenticated });
});

app.post('/admin-login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(400).render('admin-login', { error: 'Invalid email or password', isAuthenticated: false });
        }

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(400).render('admin-login', { error: 'Invalid email or password', isAuthenticated: false });
        }

        const token = jwt.sign({ id: admin._id, isAdmin: true }, SECRET_KEY, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true });
        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).render('admin-login', { error: 'An error occurred. Please try again later.', isAuthenticated: false });
    }
});

// Admin dashboard
app.get('/admin-dashboard', authenticateToken, async (req, res) => {
    if (!req.isAuthenticated || !req.user.isAdmin) {
        return res.redirect('/login');
    }

    try {
        const users = await User.find().select('-password');
        res.render('admin-dashboard', { users, isAuthenticated: req.isAuthenticated });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

// Verify user route
app.post('/verify-user', authenticateToken, async (req, res) => {
    if (!req.isAuthenticated || !req.user.isAdmin) {
        return res.redirect('/login');
    }

    try {
        const { userId } = req.body;
        await User.findByIdAndUpdate(userId, { verified: true });
        res.redirect('/admin-dashboard');
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

app.get('/about', (req, res) => {
    res.render('about', { isAuthenticated: req.isAuthenticated });
});

app.get('/contact', (req, res) => {
    res.render('contact');
});
app.get('/story', (req, res) => {
    res.render('story', { isAuthenticated: req.isAuthenticated });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
