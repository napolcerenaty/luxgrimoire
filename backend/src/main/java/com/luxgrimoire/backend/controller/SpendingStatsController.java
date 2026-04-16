package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.service.SpendingStatsService;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/user/stats/spending")
public class SpendingStatsController {

    private final SpendingStatsService service;

    public SpendingStatsController(SpendingStatsService service) {
        this.service = service;
    }

    /**
     * GET /api/user/stats/spending?currency=GBP
     * Returns full spending statistics for the authenticated user.
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getStats(
            @RequestParam(defaultValue = "GBP") String currency,
            HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(service.getStats(username, currency.toUpperCase()));
    }

    /**
     * GET /api/user/stats/spending/forecast?currency=GBP
     * Returns forecast: upcoming subscription renewals + preorders.
     */
    @GetMapping("/forecast")
    public ResponseEntity<Map<String, Object>> getForecast(
            @RequestParam(defaultValue = "GBP") String currency,
            HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(service.getForecast(username, currency.toUpperCase()));
    }

    /**
     * GET /api/user/stats/spending/sales?currency=GBP
     * Returns sale income, profit/loss, and sold books list.
     */
    @GetMapping("/sales")
    public ResponseEntity<Map<String, Object>> getSaleStats(
            @RequestParam(defaultValue = "GBP") String currency,
            HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).build();
        return ResponseEntity.ok(service.getSaleStats(username, currency.toUpperCase()));
    }
}
