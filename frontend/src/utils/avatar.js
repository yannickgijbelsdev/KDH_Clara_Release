/* eslint-disable */
const API = process.env.REACT_APP_BACKEND_URL;
const KOODH_AVATAR_FALLBACK = '/koodh-avatar.png';

/**
 * Resolves a working avatar URL from any user/avatar data format.
 * Handles: flat avatar_url, avatar.s3_url, avatar.url, avatar.file_key
 * Falls back to the Koodh bear mascot when no custom avatar is available,
 * so UIs never show initials — the bear is the default face of Clara.
 * @param {object} userOrAvatar - User object or avatar object
 * @returns {string} Resolved avatar URL (always truthy)
 */
export const getAvatarUrl = (userOrAvatar) => {
  if (!userOrAvatar) return KOODH_AVATAR_FALLBACK;

  // Flat avatar_url from API response
  if (userOrAvatar.avatar_url) return userOrAvatar.avatar_url;

  // Avatar object (from user.avatar)
  const avatar = userOrAvatar.avatar || userOrAvatar;
  if (!avatar || typeof avatar !== 'object') return KOODH_AVATAR_FALLBACK;

  if (avatar.s3_url) return avatar.s3_url;
  if (avatar.url) return avatar.url;
  if (avatar.file_key) return `${API}/api/uploads/avatars/${avatar.file_key}`;

  return KOODH_AVATAR_FALLBACK;
};
