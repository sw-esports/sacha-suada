// Configure multer for file uploads
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Ensure this directory exists
    },
    filename: function (req, file, cb) {
        const userId = req.params.userId; // Get userId from request parameters
        const fileType = file.fieldname; // Get the field name to differentiate file types
        const timestamp = Date.now(); // Create a unique timestamp
        cb(null, `${fileType}-${userId}-${timestamp}${path.extname(file.originalname)}`); // Use userId and timestamp as the filename
    }
});

const upload = multer({ storage: storage });

module.exports = upload; // Export the upload configuration