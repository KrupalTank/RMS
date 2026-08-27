// middlewares/uploadMiddleware.js
/*We use Multer with memory storage so image buffers can be encrypted in-memory before being uploaded to ImageKit.*/
const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max per file
  fileFilter,
});

module.exports = upload;