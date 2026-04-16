package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.FaqCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FaqCategoryRepository extends JpaRepository<FaqCategory, String> {
    List<FaqCategory> findAllByOrderBySortOrderAsc();
}
