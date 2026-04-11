const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

export const API = {
  BASE: API_BASE,

  // Auth
  AUTH_LOGIN:   `${API_BASE}/api/auth/login`,
  AUTH_LOGOUT:  `${API_BASE}/api/auth/logout`,
  AUTH_ME:      `${API_BASE}/api/auth/me`,
  AUTH_PROFILE: `${API_BASE}/api/auth/profile`,
  AUTH_SETTINGS:`${API_BASE}/api/auth/settings`,
  AUTH_AVATAR:  `${API_BASE}/api/auth/avatar`,

  // Books
  BOOKS:              `${API_BASE}/api/book-details`,
  BOOK: (id)       => `${API_BASE}/api/book-details/${id}`,
  BOOK_APPROVE: (id)=> `${API_BASE}/api/book-details/${id}/approve`,
  BOOK_PENDING:       `${API_BASE}/api/book-details/pending`,
  BOOK_BY_TITLE:      `${API_BASE}/api/book-details/by-title`,
  BOOK_BY_EDITION: (editionId) => `${API_BASE}/api/book-details/edition/${editionId}`,
  BOOK_IMAGE_UPLOAD:      `${API_BASE}/api/book-details/images`,
  BOOK_SERIES_BOOKS: (bookId) => `${API_BASE}/api/book-details/${bookId}/series-books`,
  BOOK_SERIES_NAMES:  `${API_BASE}/api/book-details/series-names`,
  BOOK_CONTRIBUTIONS: `${API_BASE}/api/book-details/contributions`,
  BOOK_EDITIONS: (bookId) => `${API_BASE}/api/book-details/${bookId}/editions`,
  BOOK_EDITION: (bookId, editionId) => `${API_BASE}/api/book-details/${bookId}/editions/${editionId}`,

  // Companies
  COMPANIES:            `${API_BASE}/api/companies`,
  COMPANY: (id)      => `${API_BASE}/api/companies/${id}`,

  // Authors / Artists
  AUTHORS:              `${API_BASE}/api/authors`,
  AUTHOR: (id)       => `${API_BASE}/api/authors/${id}`,
  AUTHOR_EDITIONS: (id)=> `${API_BASE}/api/authors/${id}/editions`,
  ARTISTS:              `${API_BASE}/api/artists`,
  ARTIST: (id)       => `${API_BASE}/api/artists/${id}`,
  ARTIST_EDITIONS: (id)=> `${API_BASE}/api/artists/${id}/editions`,

  // User collection
  USER_BOOKS:               `${API_BASE}/api/user/books`,
  USER_BOOK: (id)        => `${API_BASE}/api/user/books/${id}`,
  USER_SUBSCRIPTIONS:       `${API_BASE}/api/user/subscriptions`,
  USER_SUBSCRIPTION: (id)=> `${API_BASE}/api/user/subscriptions/${id}`,
  USER_SUBSCRIPTION_COST_HISTORY: (id) => `${API_BASE}/api/user/subscriptions/${id}/cost-history`,
  USER_SUB_BILLING_PERIODS: (id) => `${API_BASE}/api/user/subscriptions/${id}/billing-periods`,
  USER_SUB_BILLING_PERIOD: (entryId, periodId) => `${API_BASE}/api/user/subscriptions/${entryId}/billing-periods/${periodId}`,

  // Search
  SEARCH: `${API_BASE}/api/search`,

  // Comments
  EDITION_COMMENTS: (editionId) => `${API_BASE}/api/editions/${editionId}/comments`,
  EDITION_COMMENT:  (editionId, commentId) => `${API_BASE}/api/editions/${editionId}/comments/${commentId}`,

  // Likes
  EDITION_LIKES:  (editionId) => `${API_BASE}/api/editions/${editionId}/likes`,
  COMMENT_LIKES:  (commentId) => `${API_BASE}/api/comments/${commentId}/likes`,

  // Favorites
  FAVORITE_EDITIONS:         `${API_BASE}/api/favorites/editions`,
  FAVORITE_EDITION:  (id) => `${API_BASE}/api/favorites/editions/${id}`,
  FAVORITE_EDITION_STATUS: (id) => `${API_BASE}/api/favorites/editions/${id}/status`,
  FAVORITE_AUTHORS:          `${API_BASE}/api/favorites/authors`,
  FAVORITE_AUTHOR:   (id) => `${API_BASE}/api/favorites/authors/${id}`,
  FAVORITE_AUTHOR_STATUS: (id) => `${API_BASE}/api/favorites/authors/${id}/status`,
  // Admin
  ADMIN_USERS:          `${API_BASE}/api/admin/users`,
  ADMIN_COMPANIES:      `${API_BASE}/api/admin/companies`,
  ADMIN_COMPANY: (id) => `${API_BASE}/api/admin/companies/${id}`,
  ADMIN_COMPANY_SUBS: (id) => `${API_BASE}/api/admin/companies/${id}/subscriptions`,
  ADMIN_COMPANY_SUB: (companyId, subId) => `${API_BASE}/api/admin/companies/${companyId}/subscriptions/${subId}`,
  ADMIN_COMPANY_LOGO: (id) => `${API_BASE}/api/admin/companies/${id}/logo`,
  ADMIN_SUB_LOGO: (companyId, subId) => `${API_BASE}/api/admin/companies/${companyId}/subscriptions/${subId}/logo`,
  ADMIN_SUB_UPDATE: (companyId, subId) => `${API_BASE}/api/admin/companies/${companyId}/subscriptions/${subId}`,
  ADMIN_COMPANY_SUBS_LIST: (id) => `${API_BASE}/api/admin/companies/${id}/subscriptions`,
  ADMIN_REPORTS:        `${API_BASE}/api/admin/reports`,
  ADMIN_REPORT: (id) => `${API_BASE}/api/admin/reports/${id}/status`,
  ADMIN_DATA_REQUESTS:        `${API_BASE}/api/admin/data-requests`,
  ADMIN_DATA_REQUEST: (id) => `${API_BASE}/api/admin/data-requests/${id}/status`,
  ADMIN_DELETION_LOGS:  `${API_BASE}/api/admin/deletion-logs`,
  ADMIN_SUBSCRIPTION_GENRES: `${API_BASE}/api/admin/subscription-genres`,
};
