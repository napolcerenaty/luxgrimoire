package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.repository.*;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
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
        userRepo.findById("admin").ifPresent(userRepo::delete);
        userRepo.findById("user1").ifPresent(userRepo::delete);
        if (!userRepo.existsById("napolcerenaty")) {
            userRepo.save(new AppUser(
                "napolcerenaty", "napolcerenaty",
                "Renata", "Foremny", "Europe/Warsaw",
                "napolcerenaty@gmail.com", "admin"
            ));
        }
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByUsername(String username) {
        return userRepo.findById(username);
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByEmail(String email) {
        return userRepo.findByEmail(email);
    }

    @Transactional
    public AppUser save(AppUser user) {
        return userRepo.save(user);
    }

    @Transactional(readOnly = true)
    public boolean authenticate(String loginId, String password) {
        Optional<AppUser> user = loginId.contains("@")
            ? userRepo.findByEmail(loginId)
            : userRepo.findById(loginId);
        return user.map(u -> u.getPassword().equals(password)).orElse(false);
    }

    @Transactional(readOnly = true)
    public Optional<AppUser> findByLoginId(String loginId) {
        return loginId.contains("@")
            ? userRepo.findByEmail(loginId)
            : userRepo.findById(loginId);
    }

    // ── Book collection ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<UserBookEntry> getBooks(String username) {
        return bookEntryRepo.findByUserUsername(username);
    }

    @Transactional(readOnly = true)
    public List<UserBookEntry> getBooksByFlag(String username, String flag) {
        return bookEntryRepo.findByUsernameAndFlag(username, flag);
    }

    @Transactional(readOnly = true)
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

    @Transactional(readOnly = true)
    public List<UserSubscriptionEntry> getSubscriptions(String username) {
        return subEntryRepo.findByUserUsername(username);
    }

    @Transactional(readOnly = true)
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
