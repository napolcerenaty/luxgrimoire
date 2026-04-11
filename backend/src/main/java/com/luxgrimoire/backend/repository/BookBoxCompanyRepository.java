package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.BookBoxCompany;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface BookBoxCompanyRepository extends JpaRepository<BookBoxCompany, String> {
    List<BookBoxCompany> findByNameContainingIgnoreCase(String name);
    List<BookBoxCompany> findByNameContainingIgnoreCase(String name, Pageable pageable);
}
