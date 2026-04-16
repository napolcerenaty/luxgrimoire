package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.dto.EditionSummary;
import com.luxgrimoire.backend.model.Artist;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.repository.ArtistRepository;
import com.luxgrimoire.backend.repository.BookEditionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class ArtistService {

    private final ArtistRepository artistRepo;
    private final BookEditionRepository editionRepo;

    public ArtistService(ArtistRepository artistRepo, BookEditionRepository editionRepo) {
        this.artistRepo = artistRepo;
        this.editionRepo = editionRepo;
    }

    @Transactional(readOnly = true)
    public List<Artist> findAll() {
        return artistRepo.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<Artist> findById(String id) {
        return artistRepo.findById(id);
    }

    @Transactional(readOnly = true)
    public boolean existsById(String id) {
        return artistRepo.existsById(id);
    }

    @Transactional(readOnly = true)
    public List<EditionSummary> getEditionSummaries(String artistId) {
        List<BookEdition> editions = editionRepo.findByArtistId(artistId);
        return editions.stream().map(e -> {
            String coverUrl = e.getImageUrls().isEmpty() ? null : e.getImageUrls().get(0);
            String boxName = e.getSubscriptionName() != null && !e.getSubscriptionName().isBlank()
                    ? e.getSubscriptionName() : e.getEditionName();
            String companyName = e.getBookBoxCompanyCustomName();
            String bookTitle = e.getBook() != null ? e.getBook().getTitle() : null;
            String seriesName = e.getBook() != null ? e.getBook().getSeriesName() : null;
            String volumeNumber = e.getBook() != null ? e.getBook().getVolumeNumber() : null;
            String bookId = e.getBook() != null ? e.getBook().getId() : null;
            return new EditionSummary(e.getId(), bookId, bookTitle, seriesName, volumeNumber, coverUrl, boxName, companyName);
        }).toList();
    }

    @Transactional
    public Artist create(Artist artist) {
        if (artist.getId() == null || artist.getId().isBlank()) {
            artist.setId(UUID.randomUUID().toString());
        }
        // Find-or-create: if instagram handle given, return existing artist with that handle
        if (artist.getInstagram() != null && !artist.getInstagram().isBlank()) {
            String handle = artist.getInstagram().startsWith("@")
                    ? artist.getInstagram().substring(1) : artist.getInstagram();
            artist.setInstagram(handle);
            Optional<Artist> existing = artistRepo.findByInstagram(handle);
            if (existing.isPresent()) return existing.get();
        }
        return artistRepo.save(artist);
    }

    @Transactional
    public Optional<Artist> update(String id, Artist updated) {
        if (!artistRepo.existsById(id)) return Optional.empty();
        updated.setId(id);
        return Optional.of(artistRepo.save(updated));
    }

    @Transactional
    public boolean delete(String id) {
        if (!artistRepo.existsById(id)) return false;
        artistRepo.deleteById(id);
        return true;
    }

    @Transactional(readOnly = true)
    public long countEditions(String artistId) {
        return editionRepo.countByArtistId(artistId);
    }
}
