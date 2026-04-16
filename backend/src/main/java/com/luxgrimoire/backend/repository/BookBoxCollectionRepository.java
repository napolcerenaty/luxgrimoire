package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.BookBoxCollection;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface BookBoxCollectionRepository extends JpaRepository<BookBoxCollection, String> {
    List<BookBoxCollection> findByCompanyIdOrderByNameAsc(String companyId);
}
