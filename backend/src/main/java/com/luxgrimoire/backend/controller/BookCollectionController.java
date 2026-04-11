package com.luxgrimoire.backend.controller;

import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/collection")
public class BookCollectionController {

    @GetMapping
    public List<?> getCollection() {
        return List.of();
    }
}
