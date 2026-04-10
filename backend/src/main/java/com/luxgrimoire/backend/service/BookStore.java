package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

@Component
public class BookStore {

    private final BookRepository bookRepo;
    private final BookEditionRepository editionRepo;

    public BookStore(BookRepository bookRepo, BookEditionRepository editionRepo) {
        this.bookRepo = bookRepo;
        this.editionRepo = editionRepo;
    }

    public List<Book> findAll() {
        return bookRepo.findAll();
    }

    public List<Book> findAllApproved() {
        return bookRepo.findByStatus("approved");
    }

    public List<Book> findAllPending() {
        return bookRepo.findByStatus("pending");
    }

    public Optional<Book> findById(String bookId) {
        return bookRepo.findById(bookId);
    }

    public Optional<Book> findByTitle(String title) {
        return bookRepo.findAll().stream()
                .filter(b -> b.getTitle() != null && b.getTitle().equalsIgnoreCase(title))
                .findFirst();
    }

    @Transactional
    public Book save(Book book) {
        if (book.getId() == null || book.getId().isBlank()) {
            book.setId(UUID.randomUUID().toString());
        }
        return bookRepo.save(book);
    }

    @Transactional
    public Optional<Book> updateBook(String id, Book updated) {
        return bookRepo.findById(id).map(existing -> {
            existing.setTitle(updated.getTitle());
            existing.setAuthor(updated.getAuthor());
            existing.setAuthorId(updated.getAuthorId());
            existing.setSeriesName(updated.getSeriesName());
            existing.setVolumeNumber(updated.getVolumeNumber());
            return bookRepo.save(existing);
        });
    }

    @Transactional
    public boolean deleteBook(String id) {
        if (!bookRepo.existsById(id)) return false;
        bookRepo.deleteById(id);
        return true;
    }

    @Transactional
    public Optional<BookEdition> addEdition(String bookId, BookEdition edition) {
        return bookRepo.findById(bookId).map(book -> {
            if (edition.getId() == null || edition.getId().isBlank()) {
                edition.setId(UUID.randomUUID().toString());
            }
            edition.setBook(book);
            return editionRepo.save(edition);
        });
    }

    @Transactional
    public Optional<BookEdition> updateEdition(String bookId, String editionId, BookEdition updated) {
        if (!bookRepo.existsById(bookId)) return Optional.empty();
        return editionRepo.findById(editionId).map(existing -> {
            updated.setId(editionId);
            updated.setBook(existing.getBook());
            return editionRepo.save(updated);
        });
    }

    @Transactional
    public boolean deleteEdition(String bookId, String editionId) {
        return editionRepo.findById(editionId)
                .filter(e -> e.getBook() != null && bookId.equals(e.getBook().getId()))
                .map(e -> { editionRepo.delete(e); return true; })
                .orElse(false);
    }

    public Optional<Book> findBookByEditionId(String editionId) {
        return editionRepo.findById(editionId).map(BookEdition::getBook);
    }
}
