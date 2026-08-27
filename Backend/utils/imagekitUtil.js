// utils/imagekitUtil.js
const imagekit = require('../config/imagekit');

/**
 * Deletes a file from ImageKit given its public URL
 * @param {string} fileUrl
 */
async function deleteImageFromImageKit(fileUrl) {
  try {
    if (!fileUrl) return;

    // Extract the relative path/filename from the full URL
    const urlObj = new URL(fileUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    pathParts.shift(); // remove account identifier
    const fileName = pathParts[pathParts.length - 1];

    // Find the fileId using the ImageKit listFiles API
    const files = await imagekit.listFiles({
      name: fileName,
      limit: 1,
    });

    if (files && files.length > 0) {
      await imagekit.deleteFile(files[0].fileId);
      console.log(`🗑️ Deleted from ImageKit: ${fileName}`);
    }
  } catch (error) {
    console.error('⚠️ ImageKit file deletion error (non-fatal):', error.message);
  }
}

module.exports = { deleteImageFromImageKit };