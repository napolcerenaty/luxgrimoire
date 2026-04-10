package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.ArtistContribution;
import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.BookEdition;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class BookStore {

    private final ConcurrentHashMap<String, Book> store = new ConcurrentHashMap<>();

    public BookStore() {
        // Book 1: Shadows of the Forgotten
        Book b1 = new Book();
        b1.setTitle("Shadows of the Forgotten");
        b1.setAuthor("Elena Voss");
        b1.setSeriesName("Grimoire Chronicles");
        b1.setVolumeNumber("1");

        BookEdition b1e1 = new BookEdition();
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

        BookEdition b1e2 = new BookEdition();
        b1e2.setEditionName("Standard Edition");
        b1e2.setPublisher("Arcane Press");
        b1e2.setGeneralSaleDate("2024-03-01");
        b1e2.setBasePrice(new BigDecimal("19.99"));
        b1e2.setCurrency("USD");
        b1e2.setImageUrls(new ArrayList<>(Arrays.asList(
            "https://placehold.co/400x600/060d18/00b4d0?text=Shadows+Standard"
        )));

        b1.setEditions(new ArrayList<>(Arrays.asList(b1e1, b1e2)));
        store.put(b1.getId(), b1);

        // Book 2: The Crimson Codex
        Book b2 = new Book();
        b2.setTitle("The Crimson Codex");
        b2.setAuthor("Arthur Graves");
        b2.setSeriesName("Arcane Compendium");
        b2.setVolumeNumber("2-3");

        BookEdition b2e1 = new BookEdition();
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

        BookEdition b2e2 = new BookEdition();
        b2e2.setEditionName("General Release");
        b2e2.setGeneralSaleDate("2023-07-15");
        b2e2.setBasePrice(new BigDecimal("25.00"));
        b2e2.setCurrency("EUR");

        b2.setEditions(new ArrayList<>(Arrays.asList(b2e1, b2e2)));
        store.put(b2.getId(), b2);
    }

    public List<Book> findAll() {
        return new ArrayList<>(store.values());
    }

    public Optional<Book> findById(String bookId) {
        return Optional.ofNullable(store.get(bookId));
    }

    public Optional<Book> findByTitle(String title) {
        return store.values().stream()
                .filter(b -> b.getTitle() != null && b.getTitle().equalsIgnoreCase(title))
                .findFirst();
    }

    public Book save(Book book) {
        if (book.getId() == null || book.getId().isBlank()) {
            book.setId(UUID.randomUUID().toString());
        }
        if (book.getEditions() == null) {
            book.setEditions(new ArrayList<>());
        }
        store.put(book.getId(), book);
        return book;
    }

    public Optional<Book> updateBook(String id, Book updated) {
        Book existing = store.get(id);
        if (existing == null) return Optional.empty();
        existing.setTitle(updated.getTitle());
        existing.setAuthor(updated.getAuthor());
        existing.setSeriesName(updated.getSeriesName());
        existing.setVolumeNumber(updated.getVolumeNumber());
        return Optional.of(existing);
    }

    public boolean deleteBook(String id) {
        return store.remove(id) != null;
    }

    public Optional<BookEdition> addEdition(String bookId, BookEdition edition) {
        Book book = store.get(bookId);
        if (book == null) return Optional.empty();
        if (edition.getId() == null || edition.getId().isBlank()) {
            edition.setId(UUID.randomUUID().toString());
        }
        book.getEditions().add(edition);
        return Optional.of(edition);
    }

    public Optional<BookEdition> updateEdition(String bookId, String editionId, BookEdition updated) {
        Book book = store.get(bookId);
        if (book == null) return Optional.empty();
        List<BookEdition> editions = book.getEditions();
        for (int i = 0; i < editions.size(); i++) {
            if (editionId.equals(editions.get(i).getId())) {
                updated.setId(editionId);
                editions.set(i, updated);
                return Optional.of(updated);
            }
        }
        return Optional.empty();
    }

    public boolean deleteEdition(String bookId, String editionId) {
        Book book = store.get(bookId);
        if (book == null) return false;
        return book.getEditions().removeIf(e -> editionId.equals(e.getId()));
    }

    public Optional<Book> findBookByEditionId(String editionId) {
        return store.values().stream()
                .filter(b -> b.getEditions().stream().anyMatch(e -> editionId.equals(e.getId())))
                .findFirst();
    }
}
