require('dotenv').config(); // Load environment variables

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');
const User = require('./models/User'); // User schema
const Admin = require('./models/Admin'); // Admin schema
const Post = require('./models/Post');
const upload = require('./config/multerConfig'); // Import the upload configuration
const errorHandler = require('./middlewares/errorHandler');

const app = express();
app.set("view engine", "ejs");
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { // Use environment variable
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).then(() => {
    console.log("Connected to MongoDB");
}).catch(err => {
    console.error("Connection error:", err); // Important console log
});

// Secret key for JWT
const SECRET_KEY = process.env.SECRET_KEY; // Use environment variable

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

app.use(authenticateToken); // Global authentication middleware

// Middleware to set user and notifications in res.locals
app.use(async (req, res, next) => {
    if (req.isAuthenticated && req.user) {
        try {
            const user = await User.findById(req.user.id)
                .populate('notifications.fromUserId', 'username profilePicture email contact city')
                .populate('notifications.postId'); // Populate postId if needed

            res.locals.user = user;
            res.locals.notifications = user.notifications || [];
            res.locals.isAuthenticated = req.isAuthenticated;
        } catch (err) {
            console.error("Error fetching user data for res.locals:", err); // Important console log
            res.locals.user = null;
            res.locals.notifications = [];
            res.locals.isAuthenticated = false;
        }
    } else {
        res.locals.user = null;
        res.locals.notifications = [];
        res.locals.isAuthenticated = false;
    }
    next();
});

// Routes
app.get("/", async (req, res) => {
    res.render("index"); // user and isAuthenticated are available via res.locals
});

// Login routes
app.get("/login", (req, res) => {
    res.render("login", { isAuthenticated: req.isAuthenticated });
});

app.post("/login", async (req, res, next) => {
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
        res.redirect('/dashboard/'+user._id);
    } catch (error) {
        console.error("Login error:", error); // Important console log
        next(error); // Pass error to the error-handling middleware
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
        console.error("Registration error:", error);
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
        await User.findByIdAndUpdate(req.user.id||req.params.userId, { role, contact, city, address, vendorName });

        // Redirect to the dashboard upon successful update
        res.redirect('/setup-profile/'+req.user.id||req.params.userId);
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: "An error occurred", isAuthenticated: req.isAuthenticated });
    }
   
});

// Protected dashboard route
app.get('/dashboard/:userId', async (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    try {
        const userId = req.params.userId || req.user.id;
        const currentUser = await User.findById(userId)
            .select('-password')
            .populate('notifications.fromUserId', 'username profilePicture city contact foodType quantity preferredTimeSlots maxDistance')
            .populate('notifications.postId');

        const notifications = currentUser.notifications || [];

        let oppositeUsers = [];
        let posts = [];

        if (currentUser.role === 'restaurant') {
            oppositeUsers = await User.find({ role: 'ngo' }).select('-password');
        } else if (currentUser.role === 'ngo') {
            oppositeUsers = await User.find({ role: 'restaurant' }).select('-password');
            posts = await Post.find({ user: { $in: oppositeUsers.map(user => user._id) } }).populate('user', 'username contact profilePicture');
        }

        res.render('dashboard', { 
            user: currentUser, 
            oppositeUsers, 
            posts 
            // isAuthenticated and notifications are available via res.locals
        });
    } catch (error) {
        console.error("Dashboard error:", error); // Important console log
        res.status(500).render('error', { error: "An error occurred" });
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
app.get('/setup-profile/:userId', authenticateToken, async (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(req.user.id).select('-password');
        res.render('setup-profile', { 
            isAuthenticated: req.isAuthenticated,
            userId: user._id,
            name: user.name,
            userRole: user.role,
            email: user.email,
            contact: user.contact,
            city: user.city
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

// Route to handle profile setup
app.post('/setup-profile/:userId', authenticateToken, async (req, res) => {
    const { userId } = req.params;
    const user = await User.findById(userId)
    const userRole = user.role;
   
    const {
        foodType, avgFoodQuantity, typicalTime, packagingAvailable, notePackaging,
        zomatoAvailability, governmentCertificate, foodSafetyGuidelines, additionalDetails,
        targetBeneficiaries, avgPeople, transportationAvailable, preferredTimeSlots, maxDistance
    } = req.body;

    try {
        let updateData = {};

        if (userRole === 'restaurant') {
            updateData = {
                foodType,
                avgFoodQuantity,
                typicalTime,
                packagingAvailable,
                notePackaging,
                zomatoAvailability,
                governmentCertificate,
                foodSafetyGuidelines,
                additionalDetails
            };
        } else if (userRole === 'ngo') {
            updateData = {
                targetBeneficiaries,
                avgPeople,
                transportationAvailable,
                preferredTimeSlots,
                maxDistance,
                foodSafetyGuidelines,
                additionalDetails
            };
        }

        // Ensure userId is valid and exists in the database
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).render('error', { error: 'User not found', isAuthenticated: req.isAuthenticated });
        }

        await User.findByIdAndUpdate(userId, updateData, { new: true });

        res.redirect('/dashboard/' + userId);
    } catch (error) {
        console.error("Edit profile error:", error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

app.get('/edit-profile/:userId', authenticateToken, async (req, res) => {
    const userId = req.params.userId || req.user.id;
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(userId).select('-password');
        res.render('edit-profile', { 
                isAuthenticated: req.isAuthenticated,
               user:user
        });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

app.post('/edit-profile/:userId', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    const userId = req.params.userId;
    const {
        username, email, contact, address,
        foodType, avgFoodQuantity, typicalTime, packagingAvailable, notePackaging,
        zomatoAvailability, governmentCertificate, foodSafetyGuidelines, additionalDetails,
        targetBeneficiaries, avgPeople, transportationAvailable, preferredTimeSlots, maxDistance
    } = req.body;

    try {
        const updateData = {
            username,
            email,
            contact,
            address,
            foodSafetyGuidelines,
            additionalDetails
        };

        // Check if a file was uploaded and update profilePicture
        if (req.file) {
            console.log('File uploaded:', req.file); // Log file details
            updateData.profilePicture = req.file.filename;
        } else {
            console.log('No file uploaded'); // Log if no file was uploaded
        }

        const user = await User.findById(userId).select('role');
        const userRole = user.role;

        if (userRole === 'restaurant') {
            Object.assign(updateData, {
                foodType,
                avgFoodQuantity,
                typicalTime,
                packagingAvailable,
                notePackaging,
                zomatoAvailability,
                governmentCertificate
            });
        } else if (userRole === 'ngo') {
            Object.assign(updateData, {
                targetBeneficiaries,
                avgPeople,
                transportationAvailable,
                preferredTimeSlots,
                maxDistance
            });
        }

        await User.findByIdAndUpdate(userId, updateData);

        res.redirect('/dashboard/' + userId);
    } catch (error) {
        console.error("Edit profile error:", error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

// Route to display the post creation page and list user's posts
app.get('/post/:userId', authenticateToken, async (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    const userId = req.params.userId;

    try {
        const user = await User.findById(userId).select('-password');
        const posts = await Post.find({ user: userId });

        res.render('post', { user, posts, isAuthenticated: req.isAuthenticated });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

// Route to handle post creation
app.post('/post/:userId', authenticateToken, upload.single('image'), async (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    const userId = req.params.userId;
    const { quantity, foodType } = req.body;

    try {
        if (!req.file) {
            return res.status(400).send('No image uploaded.');
        }

        const newPost = new Post({
            user: userId,
            image: req.file.filename,
            quantity,
            foodType
        });

        await newPost.save();

        // Update the User model to include the new post ID
        await User.findByIdAndUpdate(userId, { $push: { posts: newPost._id } });

        res.redirect('/post/' + userId);
    } catch (error) {
        console.error("Post creation error:", error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

app.post('/request-donation/:postId', authenticateToken, async (req, res) => {
    const postId = req.params.postId;
    const userId = req.user.id;

    try {
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).send('Post not found');
        }

        // Create a notification for the post owner
        const notification = {
            type: 'donation_request',
            postId: postId,
            fromUserId: userId,
            status: 'pending'
        };

        // Add notification to the post owner's notifications
        await User.findByIdAndUpdate(post.user, { $push: { notifications: notification } });

        res.status(200).send('Request sent successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('An error occurred');
    }
});

// Route to render notifications
app.get('/notifications', authenticateToken, async (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }

    try {
        const user = await User.findById(req.user.id)
            .populate('notifications.fromUserId', 'username profilePicture email contact city') // Include additional fields
            .populate('notifications.postId'); // Populate postId if needed

        const notifications = user.notifications || [];
        res.render('notification', { notifications, isAuthenticated: req.isAuthenticated, user });
    } catch (error) {
        console.error(error);
        res.status(500).render('error', { error: 'An error occurred', isAuthenticated: req.isAuthenticated });
    }
});

// Accept donation request
app.post('/notifications/:notificationId/accept', authenticateToken, async (req, res) => {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    try {
        // Find the notification and update its status to accepted
        const notificationUpdateResult = await User.updateOne(
            { 'notifications._id': notificationId },
            { $set: { 'notifications.$.status': 'accepted' } }
        );

        // Check if the notification was updated
        if (notificationUpdateResult.nModified === 0) {
            return res.status(404).send('Notification not found or already accepted');
        }

        // Get the notification details to find the requester
        const notificationDetails = await User.findOne(
            { 'notifications._id': notificationId },
            { 'notifications.$': 1 }
        );

        if (notificationDetails) {
            const requesterId = notificationDetails.notifications[0].fromUserId; // Get the requester ID

            // Check if a response notification already exists
            const existingNotification = notificationDetails.notifications.find(n => n.fromUserId.toString() === userId && n.postId.toString() === notificationDetails.notifications[0].postId);
            if (!existingNotification) {
                // Create a new notification for the requester
                const newNotification = {
                    type: 'donation_request',
                    postId: notificationDetails.notifications[0].postId,
                    fromUserId: userId,
                    status: 'accepted'
                };

                // Push the new notification to the requester's notifications
                await User.findByIdAndUpdate(requesterId, { $push: { notifications: newNotification } });
            } else {
                // Update the existing notification if it exists
                await User.updateOne(
                    { 'notifications._id': existingNotification._id },
                    { $set: { 'notifications.$.status': 'accepted' } }
                );
            }

            res.redirect('/notifications');
        } else {
            console.error("Notification details not found for ID:", notificationId);
            res.status(404).send('Notification details not found');
        }
    } catch (error) {
        console.error("Accept donation request error:", error);
        res.status(500).send('An error occurred');
    }
});

// Reject donation request
app.post('/notifications/:notificationId/reject', authenticateToken, async (req, res) => {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    try {
        // Find the notification and update its status to rejected
        const notificationUpdateResult = await User.updateOne(
            { 'notifications._id': notificationId },
            { $set: { 'notifications.$.status': 'rejected' } }
        );

        // Check if the notification was updated
        if (notificationUpdateResult.nModified === 0) {
            return res.status(404).send('Notification not found or already rejected');
        }

        // Get the notification details to find the requester
        const notificationDetails = await User.findOne(
            { 'notifications._id': notificationId },
            { 'notifications.$': 1 }
        );

        if (notificationDetails) {
            const requesterId = notificationDetails.notifications[0].fromUserId; // Get the requester ID

            // Check if a response notification already exists
            const existingNotification = notificationDetails.notifications.find(n => n.fromUserId.toString() === userId && n.postId.toString() === notificationDetails.notifications[0].postId);
            if (!existingNotification) {
                // Create a new notification for the requester
                const newNotification = {
                    type: 'donation_request',
                    postId: notificationDetails.notifications[0].postId,
                    fromUserId: userId,
                    status: 'rejected'
                };

                // Push the new notification to the requester's notifications
                await User.findByIdAndUpdate(requesterId, { $push: { notifications: newNotification } });
            } else {
                // Update the existing notification if it exists
                await User.updateOne(
                    { 'notifications._id': existingNotification._id },
                    { $set: { 'notifications.$.status': 'rejected' } }
                );
            }

            res.redirect('/notifications');
        } else {
            console.error("Notification details not found for ID:", notificationId);
            res.status(404).send('Notification details not found');
        }
    } catch (error) {
        console.error("Reject donation request error:", error);
        res.status(500).send('An error occurred');
    }
});

// Route to handle notification deletion
app.post('/notifications/:notificationId/delete', authenticateToken, async (req, res) => {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    try {
        // Remove the notification from the user's notifications array
        await User.findByIdAndUpdate(userId, { $pull: { notifications: { _id: notificationId } } });

        // Send a JSON response indicating success
        res.status(200).json({ message: 'Notification deleted successfully' });
    } catch (error) {
        console.error("Error deleting notification:", error);
        // Send a JSON response indicating an error
        res.status(500).json({ error: 'An error occurred' });
    }
});

// 404 Handler
app.use((req, res, next) => {
    res.status(404).render('error', { error: "Page Not Found", isAuthenticated: req.isAuthenticated });
});

// Error-Handling Middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`); // Important console log
});
