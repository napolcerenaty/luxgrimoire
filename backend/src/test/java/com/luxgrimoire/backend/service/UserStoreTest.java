package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.UserBookEntry;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.UserBookEntryRepository;
import com.luxgrimoire.backend.repository.UserSubscriptionEntryRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UserStoreTest {

    @Mock AppUserRepository userRepo;
    @Mock UserBookEntryRepository bookEntryRepo;
    @Mock UserSubscriptionEntryRepository subEntryRepo;

    @InjectMocks UserStore userStore;

    private AppUser testUser;

    @BeforeEach
    void setUp() {
        testUser = new AppUser("testuser", "pass123", "Test", "User", "UTC");
    }

    // ── authenticate ──────────────────────────────────────────────────────────

    @Test
    void authenticate_correctPassword_returnsTrue() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        assertThat(userStore.authenticate("testuser", "pass123")).isTrue();
    }

    @Test
    void authenticate_wrongPassword_returnsFalse() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        assertThat(userStore.authenticate("testuser", "wrong")).isFalse();
    }

    @Test
    void authenticate_unknownUser_returnsFalse() {
        when(userRepo.findById("unknown")).thenReturn(Optional.empty());
        assertThat(userStore.authenticate("unknown", "any")).isFalse();
    }

    // ── addBook ───────────────────────────────────────────────────────────────

    @Test
    void addBook_withOwnedFlag_setsFlag() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        when(bookEntryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserBookEntry result = userStore.addBook("testuser", "book1", "edition1", "OWNED");

        assertThat(result.getFlag()).isEqualTo("OWNED");
        assertThat(result.getBookId()).isEqualTo("book1");
        assertThat(result.getEditionId()).isEqualTo("edition1");
    }

    @Test
    void addBook_withIsoFlag_setsIsoFlag() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        when(bookEntryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserBookEntry result = userStore.addBook("testuser", "book2", "edition2", "ISO");

        assertThat(result.getFlag()).isEqualTo("ISO");
    }

    @Test
    void addBook_withInterestedFlag_setsFlag() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        when(bookEntryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserBookEntry result = userStore.addBook("testuser", "book3", "edition3", "INTERESTED");

        assertThat(result.getFlag()).isEqualTo("INTERESTED");
    }

    @Test
    void addBook_withNullFlag_defaultsToOwned() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        when(bookEntryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserBookEntry result = userStore.addBook("testuser", "book4", "edition4", null);

        assertThat(result.getFlag()).isEqualTo("OWNED");
    }

    @Test
    void addBook_withBlankFlag_defaultsToOwned() {
        when(userRepo.findById("testuser")).thenReturn(Optional.of(testUser));
        when(bookEntryRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserBookEntry result = userStore.addBook("testuser", "book5", "edition5", "  ");

        assertThat(result.getFlag()).isEqualTo("OWNED");
    }

    // ── getBooksByFlag ────────────────────────────────────────────────────────

    @Test
    void getBooksByFlag_delegatesToRepository() {
        UserBookEntry entry = new UserBookEntry("b1", "e1");
        entry.setFlag("ISO");
        when(bookEntryRepo.findByUsernameAndFlag("testuser", "ISO")).thenReturn(List.of(entry));

        List<UserBookEntry> result = userStore.getBooksByFlag("testuser", "ISO");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getFlag()).isEqualTo("ISO");
        verify(bookEntryRepo).findByUsernameAndFlag("testuser", "ISO");
    }

    @Test
    void getBooksByFlag_emptyResult_returnsEmptyList() {
        when(bookEntryRepo.findByUsernameAndFlag("testuser", "INTERESTED")).thenReturn(List.of());

        List<UserBookEntry> result = userStore.getBooksByFlag("testuser", "INTERESTED");

        assertThat(result).isEmpty();
    }

    // ── removeBook ────────────────────────────────────────────────────────────

    @Test
    void removeBook_existingEntry_sameUser_returnsTrue() {
        UserBookEntry entry = new UserBookEntry("b1", "e1");
        entry.setUser(testUser);
        when(bookEntryRepo.findById("entry-id")).thenReturn(Optional.of(entry));

        boolean result = userStore.removeBook("testuser", "entry-id");

        assertThat(result).isTrue();
        verify(bookEntryRepo).delete(entry);
    }

    @Test
    void removeBook_existingEntry_differentUser_returnsFalse() {
        AppUser otherUser = new AppUser("other", "pass", "Other", "User", "UTC");
        UserBookEntry entry = new UserBookEntry("b1", "e1");
        entry.setUser(otherUser);
        when(bookEntryRepo.findById("entry-id")).thenReturn(Optional.of(entry));

        boolean result = userStore.removeBook("testuser", "entry-id");

        assertThat(result).isFalse();
        verify(bookEntryRepo, never()).delete(any());
    }

    @Test
    void removeBook_notFound_returnsFalse() {
        when(bookEntryRepo.findById("missing-id")).thenReturn(Optional.empty());

        boolean result = userStore.removeBook("testuser", "missing-id");

        assertThat(result).isFalse();
    }
}
