package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.DataRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface DataRequestRepository extends JpaRepository<DataRequest, String> {
    Page<DataRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);
    Page<DataRequest> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);
    Optional<DataRequest> findFirstByTypeAndTitle(String type, String title);
}
