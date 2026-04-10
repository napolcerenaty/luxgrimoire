package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AppUserRepository extends JpaRepository<AppUser, String> {}
