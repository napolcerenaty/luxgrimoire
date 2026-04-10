package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Artist;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ArtistRepository extends JpaRepository<Artist, String> {}
