package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Author;
import org.springframework.data.jpa.repository.JpaRepository;
public interface AuthorRepository extends JpaRepository<Author, String> {}
