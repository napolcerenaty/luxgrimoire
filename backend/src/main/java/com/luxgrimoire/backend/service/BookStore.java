package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

@Component
public class BookStore {

    private final BookRepository bookRepo;
    private final BookEditionRepository editionRepo;

    public BookStore(BookRepository bookRepo, BookEditionRepository editionRepo) {
        this.bookRepo = bookRepo;
        this.editionRepo = editionRepo;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void init() {
        if (bookRepo.count() > 0) return;

        Book b1 = new Book();
        b1.setTitle("Shadows of the Forgotten");
        b1.setAuthor("Elena Voss");
        b1.setSeriesName("Grimoire Chronicles");
        b1.setVolumeNumber("1");
        bookRepo.save(b1);

        BookEdition b1e1 = new BookEdition();
        b1e1.setBook(b1);
        b1e1.setEditionName("FairyLoot Special Edition");
        b1e1.setSubscriptionName("Dark Fantasy Subscription");
        b1e1.setPublisher("Arcane Press");
        b1e1.setSubscriptionMonth(3);
        b1e1.setSubscriptionYear(2024);
        b1e1.setFirstAccessDate("2024-02-01");
        b1e1.setEarlyAccessDate("2024-02-15");
        b1e1.setGeneralSaleDate("2024-03-01");
        b1e1.setBasePrice(new BigDecimal("29.99"));
        b1e1.setCurrency("USD");
        b1e1.setImageUrls(new ArrayList<>(Arrays.asList(
            "https://placehold.co/400x600/060d18/00b4d0?text=Shadows+Vol1",
            "https://placehold.co/400x600/060d18/00b4d0?text=Interior+Art"
        )));
        b1e1.setArtists(new ArrayList<>(Arrays.asList(
            new ArtistContribution("Maria Kovacs", "Cover Art"),
            new ArtistContribution("Tom Black", "Interior Illustrations")
        )));
        editionRepo.save(b1e1);

        BookEdition b1e2 = new BookEdition();
        b1e2.setBook(b1);
        b1e2.setEditionName("Standard Edition");
        b1e2.setPublisher("Arcane Press");
        b1e2.setGeneralSaleDate("2024-03-01");
        b1e2.setBasePrice(new BigDecimal("19.99"));
        b1e2.setCurrency("USD");
        b1e2.setImageUrls(new ArrayList<>(Arrays.asList(
            "https://placehold.co/400x600/060d18/00b4d0?text=Shadows+Standard"
        )));
        editionRepo.save(b1e2);

        Book b2 = new Book();
        b2.setTitle("The Crimson Codex");
        b2.setAuthor("Arthur Graves");
        b2.setSeriesName("Arcane Compendium");
        b2.setVolumeNumber("2-3");
        bookRepo.save(b2);

        BookEdition b2e1 = new BookEdition();
        b2e1.setBook(b2);
        b2e1.setEditionName("Illumicrate Edition");
        b2e1.setSubscriptionName("Mystic Tales");
        b2e1.setSubscriptionMonth(7);
        b2e1.setSubscriptionYear(2023);
        b2e1.setFirstAccessDate("2023-06-15");
        b2e1.setGeneralSaleDate("2023-07-01");
        b2e1.setBasePrice(new BigDecimal("45.00"));
        b2e1.setCurrency("EUR");
        b2e1.setImageUrls(new ArrayList<>(Arrays.asList(
            "https://placehold.co/400x600/060d18/00b4d0?text=Crimson+Codex"
        )));
        b2e1.setArtists(new ArrayList<>(Arrays.asList(
            new ArtistContribution("Luna Sterling", "Full Art Direction")
        )));
        editionRepo.save(b2e1);

        BookEdition b2e2 = new BookEdition();
        b2e2.setBook(b2);
        b2e2.setEditionName("General Release");
        b2e2.setGeneralSaleDate("2023-07-15");
        b2e2.setBasePrice(new BigDecimal("25.00"));
        b2e2.setCurrency("EUR");
        editionRepo.save(b2e2);
    }

    public List<Book> findAll() {
        return bookRepo.findAll();
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
