package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.dto.EditionSummary;
import com.luxgrimoire.backend.model.Author;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.repository.AuthorRepository;
import com.luxgrimoire.backend.repository.BookEditionRepository;
import com.luxgrimoire.backend.repository.BookRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class AuthorService {

    private final AuthorRepository authorRepo;
    private final BookRepository bookRepo;
    private final BookEditionRepository editionRepo;

    public AuthorService(AuthorRepository authorRepo, BookRepository bookRepo, BookEditionRepository editionRepo) {
        this.authorRepo = authorRepo;
        this.bookRepo = bookRepo;
        this.editionRepo = editionRepo;
    }

    @Transactional(readOnly = true)
    public List<Author> findAll() {
        return authorRepo.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<Author> findById(String id) {
        return authorRepo.findById(id);
    }

    @Transactional(readOnly = true)
    public boolean existsById(String id) {
        return authorRepo.existsById(id);
    }

    @Transactional(readOnly = true)
    public List<EditionSummary> getEditionSummaries(String authorId) {
        List<BookEdition> editions = editionRepo.findByAuthorId(authorId);
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
    public Author create(Author author) {
        if (author.getId() == null || author.getId().isBlank()) {
            author.setId(UUID.randomUUID().toString());
        }
        return authorRepo.save(author);
    }

    @Transactional
    public Optional<Author> update(String id, Author updated) {
        if (!authorRepo.existsById(id)) return Optional.empty();
        updated.setId(id);
        return Optional.of(authorRepo.save(updated));
    }

    @Transactional
    public boolean delete(String id) {
        if (!authorRepo.existsById(id)) return false;
        authorRepo.deleteById(id);
        return true;
    }

    @Transactional(readOnly = true)
    public long countBooks(String authorId) {
        return bookRepo.countByAuthorId(authorId);
    }
}
