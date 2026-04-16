package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.BookBoxCompany;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
public interface BookBoxCompanyRepository extends JpaRepository<BookBoxCompany, String> {
    List<BookBoxCompany> findByNameContainingIgnoreCase(String name);
    List<BookBoxCompany> findByNameContainingIgnoreCase(String name, Pageable pageable);

    @Query(value = "SELECT c.id, c.name, c.logo_url FROM book_box_company c ORDER BY c.name", nativeQuery = true)
    List<Object[]> findAllCompanySummaryRows();
}
