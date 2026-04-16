const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8080";

/** Converts a relative /uploads/... path to an absolute backend URL. */
export const assetUrl = (url) =>
  url && url.startsWith("/") ? `${API_BASE}${url}` : url;

export const API = {
  BASE: API_BASE,

  // Auth
  AUTH_LOGIN:   `${API_BASE}/api/auth/login`,
  AUTH_LOGOUT:  `${API_BASE}/api/auth/logout`,
  AUTH_ME:      `${API_BASE}/api/auth/me`,
  AUTH_REGISTER:`${API_BASE}/api/auth/register`,
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
  PARSE_EDITION_DESCRIPTION: `${API_BASE}/api/book-details/parse-edition-description`,
  BOOK_SERIES_BOOKS: (bookId) => `${API_BASE}/api/book-details/${bookId}/series-books`,
  BOOK_SERIES_NAMES:  `${API_BASE}/api/book-details/series-names`,
  BOOK_CONTRIBUTIONS: `${API_BASE}/api/book-details/contributions`,
  BOOK_RANDOM_EDITION:`${API_BASE}/api/book-details/random-edition`,
  BOOK_EDITIONS: (bookId) => `${API_BASE}/api/book-details/${bookId}/editions`,
  BOOK_EDITION: (bookId, editionId) => `${API_BASE}/api/book-details/${bookId}/editions/${editionId}`,

  // Companies
  COMPANIES:            `${API_BASE}/api/companies`,
  COMPANIES_SUMMARY:    `${API_BASE}/api/companies/summary`,
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
  USER_PURCHASES:           `${API_BASE}/api/user/purchases`,
  USER_PURCHASE_BOOKS: (txId) => `${API_BASE}/api/user/purchases/${txId}/books`,
  USER_TAGS:                `${API_BASE}/api/user/tags`,
  USER_EDITION_TAGS:   (editionId) => `${API_BASE}/api/user/editions/${editionId}/tags`,
  USER_EDITION_TAG:    (editionId, tagId) => `${API_BASE}/api/user/editions/${editionId}/tags/${tagId}`,
  USER_SUBSCRIPTIONS:       `${API_BASE}/api/user/subscriptions`,
  USER_SUBSCRIPTION: (id)=> `${API_BASE}/api/user/subscriptions/${id}`,
  USER_SUBSCRIPTION_STATUS: (id) => `${API_BASE}/api/user/subscriptions/${id}/status`,
  USER_SUBSCRIPTION_COST_HISTORY: (id) => `${API_BASE}/api/user/subscriptions/${id}/cost-history`,
  USER_SUB_BILLING_PERIODS: (id) => `${API_BASE}/api/user/subscriptions/${id}/billing-periods`,
  USER_SUB_BILLING_PERIOD: (entryId, periodId) => `${API_BASE}/api/user/subscriptions/${entryId}/billing-periods/${periodId}`,
  USER_SUB_TAGS: (id) => `${API_BASE}/api/user/subscriptions/${id}/tags`,
  USER_SUB_TAG: (entryId, tagId) => `${API_BASE}/api/user/subscriptions/${entryId}/tags/${tagId}`,

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
  FAVORITE_AUTHOR_NOTIFY: (id) => `${API_BASE}/api/favorites/authors/${id}/notify`,
  FAVORITE_BOOKS:            `${API_BASE}/api/favorites/books`,
  FAVORITE_BOOK:     (id) => `${API_BASE}/api/favorites/books/${id}`,
  FAVORITE_BOOK_STATUS: (id) => `${API_BASE}/api/favorites/books/${id}/status`,
  FAVORITE_BOOK_NOTIFY: (id) => `${API_BASE}/api/favorites/books/${id}/notify`,
  FAVORITE_EDITION_NOTIFY: (id) => `${API_BASE}/api/favorites/editions/${id}/notify`,
  FAVORITE_ARTISTS:          `${API_BASE}/api/favorites/artists`,
  FAVORITE_ARTIST:   (id) => `${API_BASE}/api/favorites/artists/${id}`,
  FAVORITE_ARTIST_STATUS: (id) => `${API_BASE}/api/favorites/artists/${id}/status`,
  FAVORITE_ARTIST_NOTIFY: (id) => `${API_BASE}/api/favorites/artists/${id}/notify`,
  FAVORITE_COMPANIES:        `${API_BASE}/api/favorites/companies`,
  FAVORITE_COMPANY:  (id) => `${API_BASE}/api/favorites/companies/${id}`,
  FAVORITE_COMPANY_STATUS: (id) => `${API_BASE}/api/favorites/companies/${id}/status`,
  FAVORITE_COMPANY_NOTIFY: (id) => `${API_BASE}/api/favorites/companies/${id}/notify`,
  // Admin
  ADMIN_USERS:          `${API_BASE}/api/admin/users`,
  ADMIN_USER_ROLE_PERMS: (username) => `${API_BASE}/api/admin/users/${username}/role-permissions`,
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
  ADMIN_NOTIF_RETENTION: `${API_BASE}/api/admin/settings/notification-retention`,
  ADMIN_SUB_MONTHS: (companyId, subId) => `${API_BASE}/api/admin/companies/${companyId}/subscriptions/${subId}/months`,
  ADMIN_MONTH: (monthId) => `${API_BASE}/api/admin/months/${monthId}`,
  ADMIN_COMPANY_EDITIONS_SEARCH: (companyId) => `${API_BASE}/api/admin/companies/${companyId}/editions/search`,

  // Friends
  FRIENDS:                      `${API_BASE}/api/friends`,
  FRIEND_REQUEST: (username) => `${API_BASE}/api/friends/request/${username}`,
  FRIEND_ACCEPT:  (id)       => `${API_BASE}/api/friends/accept/${id}`,
  FRIEND_REJECT:  (id)       => `${API_BASE}/api/friends/reject/${id}`,
  FRIEND_REMOVE:  (username) => `${API_BASE}/api/friends/${username}`,
  FRIEND_STATUS:  (username) => `${API_BASE}/api/friends/status/${username}`,
  FRIEND_REQUESTS_PENDING:      `${API_BASE}/api/friends/requests/pending`,

  // Follow
  FOLLOW:               (username) => `${API_BASE}/api/follow/${username}`,
  FOLLOW_STATUS:        (username) => `${API_BASE}/api/follow/status/${username}`,
  FOLLOW_FOLLOWERS:                   `${API_BASE}/api/follow/followers`,
  FOLLOW_FOLLOWING:                   `${API_BASE}/api/follow/following`,
  FOLLOW_USER_FOLLOWERS:(username) => `${API_BASE}/api/follow/${username}/followers`,
  FOLLOW_USER_FOLLOWING:(username) => `${API_BASE}/api/follow/${username}/following`,

  // Users
  USER_SEARCH:                  `${API_BASE}/api/users/search`,
  USER_PROFILE:  (username)  => `${API_BASE}/api/users/${username}/profile`,
  USER_PRIVACY:               `${API_BASE}/api/users/me/privacy`,
  USER_SOCIAL:                `${API_BASE}/api/users/me/social`,

  // Messages
  CONVERSATIONS:                `${API_BASE}/api/messages/conversations`,
  CONVERSATION_START:(username)=>`${API_BASE}/api/messages/conversations/start/${username}`,
  CONVERSATION_MESSAGES:(id)  => `${API_BASE}/api/messages/conversations/${id}/messages`,
  CONVERSATION_SEND: (id)     => `${API_BASE}/api/messages/conversations/${id}/messages`,
  CONVERSATION_READ: (id)     => `${API_BASE}/api/messages/conversations/${id}/read`,
  CONVERSATION_CREATE_GROUP:    `${API_BASE}/api/messages/conversations/group`,
  CONVERSATION_MEMBERS: (id) => `${API_BASE}/api/messages/conversations/${id}/members`,
  MESSAGES_UNREAD_COUNT:        `${API_BASE}/api/messages/unread-count`,
  UPLOAD_IMAGE:                 `${API_BASE}/api/upload/image`,

  // Notifications
  NOTIFICATIONS:                `${API_BASE}/api/notifications`,
  NOTIFICATIONS_UNREAD_COUNT:   `${API_BASE}/api/notifications/unread-count`,
  NOTIFICATION_READ:   (id) => `${API_BASE}/api/notifications/${id}/read`,
  NOTIFICATIONS_READ_ALL:       `${API_BASE}/api/notifications/read-all`,
  NOTIFICATIONS_READ_BATCH:     `${API_BASE}/api/notifications/read-batch`,
  NOTIFICATION_DELETE: (id) => `${API_BASE}/api/notifications/${id}`,
  NOTIFICATIONS_DELETE_BATCH:   `${API_BASE}/api/notifications/batch`,
  ADMIN_NOTIFICATIONS:          `${API_BASE}/api/admin/notifications`,
  ADMIN_SEND_EMAIL:             `${API_BASE}/api/admin/send-email`,
  ADMIN_AUDIT_LOGS:             `${API_BASE}/api/admin/audit-logs`,

  // Import / Scraper
  ADMIN_IMPORT_SCRAPE_URL:                         `${API_BASE}/api/admin/import/scrape-url`,
  ADMIN_IMPORT_SCRAPE_PARENT:                      `${API_BASE}/api/admin/import/scrape-parent`,
  ADMIN_IMPORT_SCRAPE_IMAGE:                       `${API_BASE}/api/admin/import/scrape-image`,
  ADMIN_IMPORT_AI_STATUS:                          `${API_BASE}/api/admin/import/ai-status`,
  ADMIN_IMPORT_SOURCES: (companyId, subId)      => `${API_BASE}/api/admin/import/sources/${companyId}/${subId}`,
  ADMIN_IMPORT_SOURCES_CREATE:                     `${API_BASE}/api/admin/import/sources`,
  ADMIN_IMPORT_SOURCE_DELETE: (id)             => `${API_BASE}/api/admin/import/sources/${id}`,
  ADMIN_IMPORT_SOURCE_CHECK: (id)              => `${API_BASE}/api/admin/import/sources/${id}/check-now`,
  ADMIN_IMPORT_PENDING:                            `${API_BASE}/api/admin/import/pending`,
  OL_IMPORT_STATUS:                                `${API_BASE}/api/admin/ol-import/status`,
  OL_IMPORT_TRIGGER:                               `${API_BASE}/api/admin/ol-import/trigger`,

  // ── Spending statistics ────────────────────────────────────────────────
  SPENDING_STATS: (currency = "GBP")    => `${API_BASE}/api/user/stats/spending?currency=${currency}`,
  SPENDING_FORECAST: (currency = "GBP") => `${API_BASE}/api/user/stats/spending/forecast?currency=${currency}`,
  SPENDING_SALES:    (currency = "GBP") => `${API_BASE}/api/user/stats/spending/sales?currency=${currency}`,
  ADMIN_IMPORT_PENDING_APPROVE: (id)           => `${API_BASE}/api/admin/import/pending/${id}/approve`,
  ADMIN_IMPORT_PENDING_REJECT: (id)            => `${API_BASE}/api/admin/import/pending/${id}/reject`,

  // Sale Announcements
  SALES:                          `${API_BASE}/api/sales`,
  SALES_UPCOMING:                 `${API_BASE}/api/sales/upcoming`,
  SALE: (id)                   => `${API_BASE}/api/sales/${id}`,
  SALE_PUBLIC: (id)            => `${API_BASE}/api/sales/${id}/public`,
  SALE_EDITIONS: (id)          => `${API_BASE}/api/sales/${id}/editions`,
  SALE_EDITION: (id, edId)     => `${API_BASE}/api/sales/${id}/editions/${edId}`,
  SALE_EDITIONS_REORDER: (id)  => `${API_BASE}/api/sales/${id}/editions/reorder`,
  USER_SALES_INTERESTS:           `${API_BASE}/api/user/sales/interests`,
  USER_SALE_INTEREST: (id)     => `${API_BASE}/api/user/sales/${id}/interest`,
  USER_SALES_UPCOMING:            `${API_BASE}/api/user/sales/upcoming`,

  // FAQ
  FAQ:                           `${API_BASE}/api/faq`,
  ADMIN_FAQ_CATEGORIES:          `${API_BASE}/api/admin/faq/categories`,
  ADMIN_FAQ_CATEGORY: (id)    => `${API_BASE}/api/admin/faq/categories/${id}`,
  ADMIN_FAQ_ITEMS: (catId)    => `${API_BASE}/api/admin/faq/categories/${catId}/items`,
  ADMIN_FAQ_ITEM: (id)        => `${API_BASE}/api/admin/faq/items/${id}`,

  // Static pages
  PAGE: (key)               => `${API_BASE}/api/pages/${key}`,
  ADMIN_PAGE: (key)         => `${API_BASE}/api/admin/pages/${key}`,
};
