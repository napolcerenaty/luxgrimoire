package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.BookBoxCompany;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class BookBoxCompanyStore {

    private final ConcurrentHashMap<String, BookBoxCompany> store = new ConcurrentHashMap<>();

    public BookBoxCompanyStore() {
        BookBoxCompany c1 = new BookBoxCompany();
        c1.setId(UUID.randomUUID().toString());
        c1.setName("OwlCrate");
        c1.setLogoUrl("https://placehold.co/200x100/060d18/00b4d0?text=OwlCrate");
        c1.setWebsiteUrl("https://owlcrate.com");
        c1.setDescription("OwlCrate is a monthly YA fantasy book box subscription service.");
        c1.setLocation("United States");
        c1.setDefaultCurrency("USD");
        c1.setSubscriptions(new ArrayList<>(Arrays.asList("OwlCrate Standard", "OwlCrate Jr")));
        c1.setManagerUsernames(new ArrayList<>(Arrays.asList("admin")));
        store.put(c1.getId(), c1);

        BookBoxCompany c2 = new BookBoxCompany();
        c2.setId(UUID.randomUUID().toString());
        c2.setName("FairyLoot");
        c2.setLogoUrl("https://placehold.co/200x100/060d18/00b4d0?text=FairyLoot");
        c2.setWebsiteUrl("https://fairyloot.com");
        c2.setDescription("FairyLoot is a UK-based fantasy book subscription box.");
        c2.setLocation("United Kingdom");
        c2.setDefaultCurrency("GBP");
        c2.setSubscriptions(new ArrayList<>(Arrays.asList("FairyLoot Adult", "FairyLoot YA")));
        c2.setManagerUsernames(new ArrayList<>(Arrays.asList("admin")));
        store.put(c2.getId(), c2);
    }

    public List<BookBoxCompany> findAll() {
        return new ArrayList<>(store.values());
    }

    public Optional<BookBoxCompany> findById(String id) {
        return Optional.ofNullable(store.get(id));
    }

    public BookBoxCompany save(BookBoxCompany c) {
        if (c.getId() == null || c.getId().isBlank()) {
            c.setId(UUID.randomUUID().toString());
        }
        store.put(c.getId(), c);
        return c;
    }

    public Optional<BookBoxCompany> update(String id, BookBoxCompany c) {
        if (!store.containsKey(id)) {
            return Optional.empty();
        }
        c.setId(id);
        store.put(id, c);
        return Optional.of(c);
    }

    public boolean delete(String id) {
        return store.remove(id) != null;
    }
}
