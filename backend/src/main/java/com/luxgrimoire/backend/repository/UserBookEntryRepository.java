package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.UserBookEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface UserBookEntryRepository extends JpaRepository<UserBookEntry, String> {
    List<UserBookEntry> findByUserUsername(String username);
    long countByUserUsernameAndEditionId(String username, String editionId);
}
