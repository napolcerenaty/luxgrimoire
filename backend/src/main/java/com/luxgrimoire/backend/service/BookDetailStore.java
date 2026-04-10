package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.ArtistContribution;
import com.luxgrimoire.backend.model.BookDetail;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class BookDetailStore {

    private final ConcurrentHashMap<String, BookDetail> store = new ConcurrentHashMap<>();

    public BookDetailStore() {
        BookDetail b1 = new BookDetail();
        b1.setId(UUID.randomUUID().toString());
        b1.setTitle("Shadows of the Forgotten");
        b1.setAuthor("Elena Voss");
        b1.setSeriesName("Grimoire Chronicles");
        b1.setVolumeNumber("1");
        b1.setSubscriptionName("Dark Fantasy Subscription");
        b1.setPublisher("Arcane Press");
        b1.setSubscriptionMonth(3);
        b1.setSubscriptionYear(2024);
        b1.setFirstAccessDate("2024-02-01");
        b1.setEarlyAccessDate("2024-02-15");
        b1.setGeneralSaleDate("2024-03-01");
        b1.setBasePrice(new BigDecimal("29.99"));
        b1.setCurrency("USD");
        List<String> urls1 = new ArrayList<>();
        urls1.add("https://placehold.co/400x600/1c1208/c4943d?text=Shadows+Vol1");
        urls1.add("https://placehold.co/400x600/1c1208/c4943d?text=Interior+Art");
        b1.setImageUrls(urls1);
        List<ArtistContribution> artists1 = new ArrayList<>();
        artists1.add(new ArtistContribution("Maria Kovacs", "Cover Art"));
        artists1.add(new ArtistContribution("Tom Black", "Interior Illustrations"));
        b1.setArtists(artists1);
        store.put(b1.getId(), b1);

        BookDetail b2 = new BookDetail();
        b2.setId(UUID.randomUUID().toString());
        b2.setTitle("The Crimson Codex");
        b2.setAuthor("Arthur Graves");
        b2.setSeriesName("Arcane Compendium");
        b2.setVolumeNumber("2-3");
        b2.setSubscriptionName("Mystic Tales");
        b2.setPublisher(null);
        b2.setSubscriptionMonth(7);
        b2.setSubscriptionYear(2023);
        b2.setFirstAccessDate("2023-06-15");
        b2.setEarlyAccessDate(null);
        b2.setGeneralSaleDate("2023-07-01");
        b2.setBasePrice(new BigDecimal("45.00"));
        b2.setCurrency("EUR");
        List<String> urls2 = new ArrayList<>();
        urls2.add("https://placehold.co/400x600/1c1208/c4943d?text=Crimson+Codex");
        b2.setImageUrls(urls2);
        List<ArtistContribution> artists2 = new ArrayList<>();
        artists2.add(new ArtistContribution("Luna Sterling", "Full Art Direction"));
        b2.setArtists(artists2);
        store.put(b2.getId(), b2);
    }

    public List<BookDetail> findAll() {
        return new ArrayList<>(store.values());
    }

    public Optional<BookDetail> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public Optional<BookDetail> findByTitle(String title) {
        return store.values().stream()
                .filter(b -> b.getTitle() != null && b.getTitle().equalsIgnoreCase(title))
                .findFirst();
    }

    public BookDetail save(BookDetail detail) {
        if (detail.getId() == null || detail.getId().isBlank()) {
            detail.setId(UUID.randomUUID().toString());
        }
        store.put(detail.getId(), detail);
        return detail;
    }

    public Optional<BookDetail> update(String id, BookDetail detail) {
        if (!store.containsKey(id)) {
            return Optional.empty();
        }
        detail.setId(id);
        store.put(id, detail);
        return Optional.of(detail);
    }

    public boolean delete(String id) {
        return store.remove(id) != null;
    }
}
