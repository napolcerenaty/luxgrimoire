package com.luxgrimoire.backend.dto;

public record UserDto(
        String username,
        String firstName,
        String lastName,
        String timezone,
        String avatarUrl,
        String email,
        String role
) {}
