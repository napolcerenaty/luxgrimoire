package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserSubEntryTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserSubEntryTagRepository extends JpaRepository<UserSubEntryTag, String> {

    List<UserSubEntryTag> findByUsernameAndEntryId(String username, String entryId);

    boolean existsByUsernameAndEntryIdAndTag(String username, String entryId, String tag);

    @Query("SELECT DISTINCT t.tag FROM UserSubEntryTag t WHERE t.username = :username ORDER BY t.tag")
    List<String> findDistinctTagsByUsername(@Param("username") String username);
}
