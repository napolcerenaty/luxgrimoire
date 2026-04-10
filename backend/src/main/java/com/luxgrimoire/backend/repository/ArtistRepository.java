package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Artist;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface ArtistRepository extends JpaRepository<Artist, String> {
    List<Artist> findByNameContainingIgnoreCase(String name);
}
