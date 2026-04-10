package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Book;
import org.springframework.data.jpa.repository.JpaRepository;
public interface BookRepository extends JpaRepository<Book, String> {}
