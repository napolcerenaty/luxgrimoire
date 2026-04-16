package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.FaqItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface FaqItemRepository extends JpaRepository<FaqItem, String> {
    // category_id is a column, use nested property path category.id
    List<FaqItem> findByCategory_IdOrderBySortOrderAsc(String categoryId);
}
