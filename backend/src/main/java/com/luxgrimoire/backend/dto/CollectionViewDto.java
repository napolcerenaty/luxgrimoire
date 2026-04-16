package com.luxgrimoire.backend.dto;

import java.math.BigDecimal;

/**
 * Flat view of a user's book collection entry, joining
 * UserBookEntry + Book + BookEdition data.
 */
public record CollectionViewDto(
        String entryId,
        String bookId,
        String editionId,
        String language,
        String author,
        String title,
        String series,
        String volume,
        String editionName,
        String publisher,
        String features,
        String readingStatus,
        String ownershipStatus,
        String condition,
        String purchaseDate,
        BigDecimal allocatedPrice,
        String saleDate,
        BigDecimal salePrice,
        String saleVenue
) {}
