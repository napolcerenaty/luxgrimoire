package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Artist;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
public interface ArtistRepository extends JpaRepository<Artist, String> {
    List<Artist> findByNameContainingIgnoreCase(String name);
    List<Artist> findByNameContainingIgnoreCase(String name, Pageable pageable);
    Optional<Artist> findByInstagram(String instagram);
}
