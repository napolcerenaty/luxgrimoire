package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.model.Subscription;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class BookBoxCompanyStore {

    // Fixed UUIDs for stable sample data
    private static final String OWLCRATE_SUB1_ID = "a1b2c3d4-0001-0000-0000-000000000001";
    private static final String OWLCRATE_SUB2_ID = "a1b2c3d4-0002-0000-0000-000000000002";
    private static final String FAIRYLOOT_SUB1_ID = "b2c3d4e5-0001-0000-0000-000000000003";
    private static final String FAIRYLOOT_SUB2_ID = "b2c3d4e5-0002-0000-0000-000000000004";

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

        Subscription oc1 = new Subscription();
        oc1.setId(OWLCRATE_SUB1_ID);
        oc1.setName("OwlCrate Standard");
        oc1.setType("MONTHLY");
        oc1.setShipsInternationally(true);
        oc1.setBasePrice(new BigDecimal("37.99"));
        oc1.setGenres(new ArrayList<>(Arrays.asList("YA Fantasy", "Fantasy")));
        oc1.setBookishMerch(true);

        Subscription oc2 = new Subscription();
        oc2.setId(OWLCRATE_SUB2_ID);
        oc2.setName("OwlCrate Jr");
        oc2.setType("MONTHLY");
        oc2.setShipsInternationally(true);
        oc2.setBasePrice(new BigDecimal("29.99"));
        oc2.setGenres(new ArrayList<>(Arrays.asList("Middle Grade", "Adventure")));
        oc2.setBookishMerch(true);

        c1.setSubscriptions(new ArrayList<>(Arrays.asList(oc1, oc2)));
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

        Subscription fl1 = new Subscription();
        fl1.setId(FAIRYLOOT_SUB1_ID);
        fl1.setName("FairyLoot Adult");
        fl1.setType("MONTHLY");
        fl1.setShipsInternationally(true);
        fl1.setBasePrice(new BigDecimal("32.99"));
        fl1.setGenres(new ArrayList<>(Arrays.asList("Adult Fantasy", "Dark Fantasy")));
        fl1.setBookishMerch(true);

        Subscription fl2 = new Subscription();
        fl2.setId(FAIRYLOOT_SUB2_ID);
        fl2.setName("FairyLoot YA");
        fl2.setType("MONTHLY");
        fl2.setShipsInternationally(true);
        fl2.setBasePrice(new BigDecimal("27.99"));
        fl2.setGenres(new ArrayList<>(Arrays.asList("YA Fantasy", "Romance")));
        fl2.setBookishMerch(true);

        c2.setSubscriptions(new ArrayList<>(Arrays.asList(fl1, fl2)));
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
