package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.*;

@Service
public class BookBoxCompanyStore {

    private final BookBoxCompanyRepository companyRepo;
    private final SubscriptionRepository subscriptionRepo;

    public BookBoxCompanyStore(BookBoxCompanyRepository companyRepo, SubscriptionRepository subscriptionRepo) {
        this.companyRepo = companyRepo;
        this.subscriptionRepo = subscriptionRepo;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void init() {
        if (companyRepo.count() > 0) return;

        BookBoxCompany c1 = new BookBoxCompany();
        c1.setId(UUID.randomUUID().toString());
        c1.setName("OwlCrate");
        c1.setLogoUrl("https://placehold.co/200x100/060d18/00b4d0?text=OwlCrate");
        c1.setWebsiteUrl("https://owlcrate.com");
        c1.setDescription("OwlCrate is a monthly YA fantasy book box subscription service.");
        c1.setLocation("United States");
        c1.setDefaultCurrency("USD");
        c1.setManagerUsernames(new ArrayList<>(Arrays.asList("admin")));
        companyRepo.save(c1);

        Subscription oc1 = new Subscription();
        oc1.setCompany(c1);
        oc1.setName("OwlCrate Standard");
        oc1.setType("MONTHLY");
        oc1.setShipsInternationally(true);
        oc1.setBasePrice(new BigDecimal("37.99"));
        oc1.setGenres(new ArrayList<>(Arrays.asList("YA Fantasy", "Fantasy")));
        oc1.setBookishMerch(true);
        subscriptionRepo.save(oc1);

        Subscription oc2 = new Subscription();
        oc2.setCompany(c1);
        oc2.setName("OwlCrate Jr");
        oc2.setType("MONTHLY");
        oc2.setShipsInternationally(true);
        oc2.setBasePrice(new BigDecimal("29.99"));
        oc2.setGenres(new ArrayList<>(Arrays.asList("Middle Grade", "Adventure")));
        oc2.setBookishMerch(true);
        subscriptionRepo.save(oc2);

        BookBoxCompany c2 = new BookBoxCompany();
        c2.setId(UUID.randomUUID().toString());
        c2.setName("FairyLoot");
        c2.setLogoUrl("https://placehold.co/200x100/060d18/00b4d0?text=FairyLoot");
        c2.setWebsiteUrl("https://fairyloot.com");
        c2.setDescription("FairyLoot is a UK-based fantasy book subscription box.");
        c2.setLocation("United Kingdom");
        c2.setDefaultCurrency("GBP");
        c2.setManagerUsernames(new ArrayList<>(Arrays.asList("admin")));
        companyRepo.save(c2);

        Subscription fl1 = new Subscription();
        fl1.setCompany(c2);
        fl1.setName("FairyLoot Adult");
        fl1.setType("MONTHLY");
        fl1.setShipsInternationally(true);
        fl1.setBasePrice(new BigDecimal("32.99"));
        fl1.setGenres(new ArrayList<>(Arrays.asList("Adult Fantasy", "Dark Fantasy")));
        fl1.setBookishMerch(true);
        subscriptionRepo.save(fl1);

        Subscription fl2 = new Subscription();
        fl2.setCompany(c2);
        fl2.setName("FairyLoot YA");
        fl2.setType("MONTHLY");
        fl2.setShipsInternationally(true);
        fl2.setBasePrice(new BigDecimal("27.99"));
        fl2.setGenres(new ArrayList<>(Arrays.asList("YA Fantasy", "Romance")));
        fl2.setBookishMerch(true);
        subscriptionRepo.save(fl2);
    }

    @Transactional(readOnly = true)
    public List<BookBoxCompany> findAll() {
        return companyRepo.findAll();
    }

    @Transactional(readOnly = true)
    public Optional<BookBoxCompany> findById(String id) {
        return companyRepo.findById(id);
    }

    @Transactional
    public BookBoxCompany save(BookBoxCompany c) {
        if (c.getId() == null || c.getId().isBlank()) {
            c.setId(UUID.randomUUID().toString());
        }
        return companyRepo.save(c);
    }

    @Transactional
    public Optional<BookBoxCompany> update(String id, BookBoxCompany updated) {
        return companyRepo.findById(id).map(existing -> {
            existing.setName(updated.getName());
            existing.setLogoUrl(updated.getLogoUrl());
            existing.setWebsiteUrl(updated.getWebsiteUrl());
            existing.setDescription(updated.getDescription());
            existing.setLocation(updated.getLocation());
            existing.setDefaultCurrency(updated.getDefaultCurrency());
            existing.setManagerUsernames(updated.getManagerUsernames() != null ? updated.getManagerUsernames() : new ArrayList<>());
            existing.getSubscriptions().clear();
            if (updated.getSubscriptions() != null) {
                for (Subscription s : updated.getSubscriptions()) {
                    s.setCompany(existing);
                    existing.getSubscriptions().add(s);
                }
            }
            return companyRepo.save(existing);
        });
    }

    @Transactional
    public boolean delete(String id) {
        if (!companyRepo.existsById(id)) return false;
        companyRepo.deleteById(id);
        return true;
    }

    /** Update only scalar metadata fields; subscriptions are managed separately. */
    @Transactional
    public Optional<BookBoxCompany> updateMetadata(String id, String name, String logoUrl,
                                                   String websiteUrl, String description,
                                                   String location, String defaultCurrency) {
        return companyRepo.findById(id).map(existing -> {
            if (name != null)            existing.setName(name);
            if (logoUrl != null)         existing.setLogoUrl(logoUrl);
            if (websiteUrl != null)      existing.setWebsiteUrl(websiteUrl);
            if (description != null)     existing.setDescription(description);
            if (location != null)        existing.setLocation(location);
            if (defaultCurrency != null) existing.setDefaultCurrency(defaultCurrency);
            return companyRepo.save(existing);
        });
    }

    @Transactional
    public Subscription addSubscription(String companyId, Subscription sub) {
        BookBoxCompany company = companyRepo.findById(companyId)
                .orElseThrow(() -> new IllegalArgumentException("Company not found: " + companyId));
        sub.setCompany(company);
        return subscriptionRepo.save(sub);
    }

    @Transactional
    public boolean deleteSubscription(String subscriptionId) {
        if (!subscriptionRepo.existsById(subscriptionId)) return false;
        subscriptionRepo.deleteById(subscriptionId);
        return true;
    }
}
