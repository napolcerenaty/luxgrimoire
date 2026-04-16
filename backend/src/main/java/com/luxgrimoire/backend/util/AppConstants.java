package com.luxgrimoire.backend.util;

public final class AppConstants {

    public static final String SESSION_USERNAME        = "username";
    public static final String SESSION_ROLE            = "role";
    public static final String SESSION_PERMISSIONS     = "adminPermissions";
    public static final String SESSION_MANAGED_COMPANY = "managedCompanyId";

    // Roles
    public static final String ROLE_USER            = "user";
    public static final String ROLE_COMPANY_MANAGER = "company_manager";
    public static final String ROLE_MODERATOR       = "moderator";
    public static final String ROLE_ADMIN           = "admin";
    public static final String ROLE_SUPERADMIN      = "superadmin";

    // Granular admin permissions (one per admin panel section)
    public static final String PERM_MANAGE_COMPANIES      = "MANAGE_COMPANIES";
    public static final String PERM_MANAGE_SALES          = "MANAGE_SALES";
    public static final String PERM_MANAGE_REPORTS        = "MANAGE_REPORTS";
    public static final String PERM_MANAGE_DATA_REQUESTS  = "MANAGE_DATA_REQUESTS";
    public static final String PERM_MANAGE_NOTIFICATIONS  = "MANAGE_NOTIFICATIONS";
    public static final String PERM_MANAGE_EMAIL          = "MANAGE_EMAIL";
    public static final String PERM_MANAGE_USERS          = "MANAGE_USERS";
    public static final String PERM_MANAGE_IMPORTS        = "MANAGE_IMPORTS";
    public static final String PERM_MANAGE_AUDIT          = "MANAGE_AUDIT";

    public static final String STATUS_APPROVED  = "approved";
    public static final String STATUS_PENDING   = "pending";

    private AppConstants() {}
}
