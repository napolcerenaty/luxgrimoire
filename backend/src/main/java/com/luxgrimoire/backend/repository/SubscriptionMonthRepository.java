package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.SubscriptionMonth;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

public interface SubscriptionMonthRepository extends JpaRepository<SubscriptionMonth, String> {

    @Modifying
    @Transactional
    @Query("UPDATE SubscriptionMonth m SET m.bookId = null WHERE m.id = :monthId")
    void unlinkBook(@Param("monthId") String monthId);
}
