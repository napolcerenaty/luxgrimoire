package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.Book;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/books")
@CrossOrigin(origins = "http://localhost:5173")
public class BookController {

    @GetMapping
    public List<Book> getBooks() {
        return List.of(
            new Book(1L, "The Name of the Wind",
                "Patrick Rothfuss", "Fantasy",
                "https://covers.openlibrary.org/b/id/8234680-L.jpg",
                "The tale of Kvothe, a legendary figure of magic and music."),
            new Book(2L, "Mistborn: The Final Empire",
                "Brandon Sanderson", "Fantasy",
                "https://covers.openlibrary.org/b/id/10527843-L.jpg",
                "A dark fantasy set in a world of ash and mist."),
            new Book(3L, "The Lies of Locke Lamora",
                "Scott Lynch", "Fantasy",
                "https://covers.openlibrary.org/b/id/8236561-L.jpg",
                "A cunning thief in a city of secrets and sorcery."),
            new Book(4L, "A Wizard of Earthsea",
                "Ursula K. Le Guin", "Fantasy",
                "https://covers.openlibrary.org/b/id/10519519-L.jpg",
                "A young wizard's journey of self-discovery."),
            new Book(5L, "The Shadow of the Wind",
                "Carlos Ruiz Zafón", "Mystery",
                "https://covers.openlibrary.org/b/id/8225261-L.jpg",
                "A boy discovers a mysterious book in post-war Barcelona."),
            new Book(6L, "Jonathan Strange & Mr Norrell",
                "Susanna Clarke", "Fantasy",
                "https://covers.openlibrary.org/b/id/10519870-L.jpg",
                "Magic returns to England during the Napoleonic Wars.")
        );
    }
}
