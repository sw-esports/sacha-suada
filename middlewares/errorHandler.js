const errorHandler = (err, req, res, next) => {
    console.error("Unhandled Error:", err); // Important console log

    res.status(err.status || 500);
    res.render('error', { 
        error: err.message || "An unexpected error occurred.", 
        isAuthenticated: req.isAuthenticated 
    });
};

module.exports = errorHandler; 