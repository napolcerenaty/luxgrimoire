package com.luxgrimoire.backend.controller;

import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/collection")
@CrossOrigin(origins = "http://localhost:5173")
public class BookCollectionController {

    @GetMapping
    public List<?> getCollection() {
        return List.of();
    }
}
