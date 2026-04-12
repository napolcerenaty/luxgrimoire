package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.AppUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
public interface AppUserRepository extends JpaRepository<AppUser, String> {
    Optional<AppUser> findByEmail(String email);
    Page<AppUser> findByEmailContainingIgnoreCase(String email, Pageable pageable);

    @Query("SELECT u FROM AppUser u WHERE LOWER(u.username) LIKE %:q% AND u.username != :me ORDER BY u.username")
    List<AppUser> searchByUsername(@Param("q") String q, @Param("me") String me);
}