package com.luxgrimoire.backend.dto;

public record BookSummaryDto(
        String id,
        String title,
        String author,
        String authorId,
        String seriesName,
        String volumeNumber,
        String status,
        String coverUrl
) {}
