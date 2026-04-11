package com.luxgrimoire.backend.util;

import jakarta.servlet.http.HttpSession;

public final class AuthHelper {

    private AuthHelper() {}

    public static String getUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    public static boolean isLoggedIn(HttpSession session) {
        return getUsername(session) != null;
    }

    public static boolean isAdmin(HttpSession session) {
        return AppConstants.ROLE_ADMIN.equals(session.getAttribute(AppConstants.SESSION_ROLE));
    }
}
