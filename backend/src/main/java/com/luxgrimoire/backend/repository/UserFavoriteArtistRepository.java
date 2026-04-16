package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserFavoriteArtist;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserFavoriteArtistRepository extends JpaRepository<UserFavoriteArtist, String> {
    List<UserFavoriteArtist> findByUsernameOrderByAddedAtDesc(String username);
    Optional<UserFavoriteArtist> findByUsernameAndArtistId(String username, String artistId);
    boolean existsByUsernameAndArtistId(String username, String artistId);
    void deleteByUsernameAndArtistId(String username, String artistId);
    long countByArtistId(String artistId);
    List<UserFavoriteArtist> findByArtistIdAndNotifyTrue(String artistId);
}
