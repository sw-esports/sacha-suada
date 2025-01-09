// Configure multer for file uploads
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Ensure this directory exists
    },
    filename: function (req, file, cb) {
        const userId = req.params.userId; // Get userId from request parameters
        cb(null, userId + path.extname(file.originalname)); // Use userId as the filename
    }
});

const upload = multer({ storage: storage });

module.exports = upload; // Export the upload configuration