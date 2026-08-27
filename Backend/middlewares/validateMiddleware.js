// middlewares/validateMiddleware.js

/**
 * Higher-order middleware to enforce non-empty fields in req.body
 * @param {Array<string>} requiredFields - List of field names that must be present and non-empty
 */
const validateRequired = (requiredFields = []) => {
  return (req, res, next) => {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Request body cannot be empty.',
      });
    }

    const missingOrEmpty = [];

    for (const field of requiredFields) {
      const val = req.body[field];

      // Check for undefined, null, or empty whitespace strings
      if (
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '')
      ) {
        missingOrEmpty.push(field);
      }
    }

    if (missingOrEmpty.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing or incomplete required field(s): ${missingOrEmpty.join(', ')}. Please fill all mandatory details.`,
        missingFields: missingOrEmpty,
      });
    }

    next();
  };
};

module.exports = { validateRequired };