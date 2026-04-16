package com.luxgrimoire.backend.util;

import jakarta.servlet.http.HttpSession;
import java.util.Arrays;
import java.util.List;

public final class AuthHelper {

    private AuthHelper() {}

    public static String getUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    public static String getRole(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_ROLE);
    }

    public static boolean isLoggedIn(HttpSession session) {
        return getUsername(session) != null;
    }

    /** True for both "admin" and "superadmin". */
    public static boolean isAdmin(HttpSession session) {
        String role = getRole(session);
        return AppConstants.ROLE_ADMIN.equals(role) || AppConstants.ROLE_SUPERADMIN.equals(role);
    }

    public static boolean isSuperAdmin(HttpSession session) {
        return AppConstants.ROLE_SUPERADMIN.equals(getRole(session));
    }

    public static boolean isModerator(HttpSession session) {
        return AppConstants.ROLE_MODERATOR.equals(getRole(session));
    }

    public static boolean isCompanyManager(HttpSession session) {
        return AppConstants.ROLE_COMPANY_MANAGER.equals(getRole(session));
    }

    public static String getManagedCompanyId(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_MANAGED_COMPANY);
    }

    /**
     * True if the user can access the admin panel at all:
     * admin/superadmin → always; moderator/company_manager → always (role defaults);
     * user with explicit permissions → yes.
     */
    public static boolean hasAdminAccess(HttpSession session) {
        if (isAdmin(session)) return true;
        String role = getRole(session);
        if (AppConstants.ROLE_MODERATOR.equals(role) || AppConstants.ROLE_COMPANY_MANAGER.equals(role)) return true;
        String perms = (String) session.getAttribute(AppConstants.SESSION_PERMISSIONS);
        return perms != null && !perms.isBlank();
    }

    /**
     * True if the user has the given permission, considering role defaults:
     * - admin/superadmin → all permissions
     * - moderator → MANAGE_DATA_REQUESTS, MANAGE_SALES (+ explicit extras)
     * - company_manager → MANAGE_COMPANIES (+ explicit extras)
     * - others → only explicit permissions
     */
    public static boolean hasPermission(HttpSession session, String permission) {
        if (isAdmin(session)) return true;

        String role = getRole(session);

        // Moderator default permissions
        if (AppConstants.ROLE_MODERATOR.equals(role)) {
            if (AppConstants.PERM_MANAGE_DATA_REQUESTS.equals(permission)
                    || AppConstants.PERM_MANAGE_SALES.equals(permission)) return true;
        }

        // Company manager default permissions
        if (AppConstants.ROLE_COMPANY_MANAGER.equals(role)) {
            if (AppConstants.PERM_MANAGE_COMPANIES.equals(permission)
                    || AppConstants.PERM_MANAGE_SALES.equals(permission)) return true;
        }

        // Individual explicit permissions
        String perms = (String) session.getAttribute(AppConstants.SESSION_PERMISSIONS);
        if (perms == null || perms.isBlank()) return false;
        return Arrays.stream(perms.split(",")).map(String::trim).anyMatch(p -> p.equals(permission));
    }

    public static final List<String> ALL_PERMISSIONS = List.of(
        AppConstants.PERM_MANAGE_COMPANIES,
        AppConstants.PERM_MANAGE_SALES,
        AppConstants.PERM_MANAGE_REPORTS,
        AppConstants.PERM_MANAGE_DATA_REQUESTS,
        AppConstants.PERM_MANAGE_NOTIFICATIONS,
        AppConstants.PERM_MANAGE_EMAIL,
        AppConstants.PERM_MANAGE_USERS,
        AppConstants.PERM_MANAGE_IMPORTS,
        AppConstants.PERM_MANAGE_AUDIT
    );
}
