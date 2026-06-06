/* eslint-disable */
const API = process.env.REACT_APP_BACKEND_URL;

/**
 * Resolves a working avatar URL from any user/avatar data format.
 * Handles: flat avatar_url, avatar.s3_url, avatar.url, avatar.file_key
 * @param {object} userOrAvatar - User object or avatar object
 * @returns {string|null} Resolved avatar URL or null
 */
export const getAvatarUrl = (userOrAvatar) => {
  if (!userOrAvatar) return null;

  // Flat avatar_url from API response
  if (userOrAvatar.avatar_url) return userOrAvatar.avatar_url;

  // Avatar object (from user.avatar)
  const avatar = userOrAvatar.avatar || userOrAvatar;
  if (!avatar || typeof avatar !== 'object') return null;

  if (avatar.s3_url) return avatar.s3_url;
  if (avatar.url) return avatar.url;
  if (avatar.file_key) return `${API}/api/uploads/avatars/${avatar.file_key}`;

  return null;
};
