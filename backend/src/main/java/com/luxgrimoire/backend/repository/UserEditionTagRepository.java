package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserEditionTag;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface UserEditionTagRepository extends JpaRepository<UserEditionTag, String> {

    List<UserEditionTag> findByUsernameAndEditionId(String username, String editionId);

    boolean existsByUsernameAndEditionIdAndTag(String username, String editionId, String tag);

    /** All distinct tags the user has ever used — for autocomplete suggestions. */
    @Query("SELECT DISTINCT t.tag FROM UserEditionTag t WHERE t.username = :username ORDER BY t.tag")
    List<String> findDistinctTagsByUsername(@Param("username") String username);
}
