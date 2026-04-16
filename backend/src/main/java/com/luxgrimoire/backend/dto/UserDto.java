package com.luxgrimoire.backend.dto;

public record UserDto(
        String username,
        String firstName,
        String lastName,
        String timezone,
        String avatarUrl,
        String email,
        String role,
        String adminPermissions,
        String managedCompanyId,
        boolean libraryPublic,
        boolean messagingPrivate,
        boolean favoritesPublic,
        String bioPublic,
        String goodreadsUrl,
        String storygraphUrl,
        String instagramUrl,
        String twitterUrl,
        // Granular privacy levels
        String profilePrivacy,
        String collectionPrivacy,
        String isoPrivacy,
        String interestedPrivacy,
        String subscriptionsPrivacy,
        String favoritesPrivacy
) {}
