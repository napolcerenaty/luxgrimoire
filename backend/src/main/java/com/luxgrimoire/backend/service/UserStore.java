package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Component
public class UserStore {

    private final AppUserRepository userRepo;
    private final UserBookEntryRepository bookEntryRepo;
    private final UserSubscriptionEntryRepository subEntryRepo;

    public UserStore(AppUserRepository userRepo,
                     UserBookEntryRepository bookEntryRepo,
                     UserSubscriptionEntryRepository subEntryRepo) {
        this.userRepo = userRepo;
        this.bookEntryRepo = bookEntryRepo;
        this.subEntryRepo = subEntryRepo;
    }

    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void init() {
        if (userRepo.count() > 0) return;
        userRepo.save(new AppUser("admin", "admin", "Admin", "User", "Europe/Warsaw"));
        userRepo.save(new AppUser("user1", "user1", "Jan", "Kowalski", "Europe/Warsaw"));
    }

    public Optional<AppUser> findByUsername(String username) {
        return userRepo.findById(username);
    }

    @Transactional
    public AppUser save(AppUser user) {
        return userRepo.save(user);
    }

    public boolean authenticate(String username, String password) {
        return findByUsername(username)
                .map(u -> u.getPassword().equals(password))
                .orElse(false);
    }

    // ── Book collection ────────────────────────────────────────────────────

    public List<UserBookEntry> getBooks(String username) {
        return bookEntryRepo.findByUserUsername(username);
    }

    public List<UserBookEntry> getBooksByFlag(String username, String flag) {
        return bookEntryRepo.findByUsernameAndFlag(username, flag);
    }

    public long countBooksByEdition(String username, String editionId) {
        return bookEntryRepo.countByUserUsernameAndEditionId(username, editionId);
    }

    @Transactional
    public UserBookEntry addBook(String username, String bookId, String editionId, String flag) {
        AppUser user = userRepo.findById(username).orElseThrow();
        UserBookEntry entry = new UserBookEntry(bookId, editionId);
        entry.setUser(user);
        entry.setFlag(flag != null && !flag.isBlank() ? flag : "OWNED");
        return bookEntryRepo.save(entry);
    }

    @Transactional
    public boolean removeBook(String username, String entryId) {
        return bookEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .map(e -> { bookEntryRepo.delete(e); return true; })
                .orElse(false);
    }

    // ── Subscription collection ────────────────────────────────────────────

    public List<UserSubscriptionEntry> getSubscriptions(String username) {
        return subEntryRepo.findByUserUsername(username);
    }

    public long countSubscriptions(String username, String companyId, String subscriptionId) {
        return subEntryRepo.countByUserUsernameAndSubscriptionIdAndCompanyId(username, subscriptionId, companyId);
    }

    @Transactional
    public UserSubscriptionEntry addSubscription(String username, String companyId, String subscriptionId) {
        AppUser user = userRepo.findById(username).orElseThrow();
        UserSubscriptionEntry entry = new UserSubscriptionEntry(companyId, subscriptionId);
        entry.setUser(user);
        return subEntryRepo.save(entry);
    }

    @Transactional
    public boolean removeSubscription(String username, String entryId) {
        return subEntryRepo.findById(entryId)
                .filter(e -> e.getUser() != null && username.equals(e.getUser().getUsername()))
                .map(e -> { subEntryRepo.delete(e); return true; })
                .orElse(false);
    }
}
