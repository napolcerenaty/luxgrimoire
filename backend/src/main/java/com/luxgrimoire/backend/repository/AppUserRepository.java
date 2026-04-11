package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.AppUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface AppUserRepository extends JpaRepository<AppUser, String> {
    Optional<AppUser> findByEmail(String email);
    Page<AppUser> findByEmailContainingIgnoreCase(String email, Pageable pageable);
}