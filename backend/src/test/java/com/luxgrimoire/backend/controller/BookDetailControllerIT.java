package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.Book;
import com.luxgrimoire.backend.model.BookEdition;
import com.luxgrimoire.backend.repository.BookEditionRepository;
import com.luxgrimoire.backend.repository.BookRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BookDetailControllerIT {

    @Autowired MockMvc mockMvc;
    @Autowired BookRepository bookRepository;
    @Autowired BookEditionRepository bookEditionRepository;

    @BeforeEach
    void cleanDatabase() {
        bookEditionRepository.deleteAll();
        bookRepository.deleteAll();
    }

    @Test
    void getById_returnsOnlyCurrentBookEditions() throws Exception {
        Book volumeTwo = createBook("A Court of Lanterns", "A. Writer", "series-1", "Lux Saga", "2", "approved");
        Book volumeOne = createBook("A Dawn of Lanterns", "A. Writer", "series-1", "Lux Saga", "1", "approved");

        createEdition(volumeOne, "Standard");
        createEdition(volumeTwo, "Collector");

        mockMvc.perform(get("/api/book-details/{bookId}", volumeTwo.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(volumeTwo.getId()))
                .andExpect(jsonPath("$.title").value("A Court of Lanterns"))
                .andExpect(jsonPath("$.editions.length()").value(1))
                .andExpect(jsonPath("$.editions[0].editionName").value("Collector"))
                .andExpect(jsonPath("$.seriesBooks").doesNotExist());
    }

    @Test
    void getSeriesBooks_returnsOrderedBooksWithoutEditionPayload() throws Exception {
        Book volumeTwo = createBook("A Court of Lanterns", "A. Writer", "series-1", "Lux Saga", "2", "approved");
        Book volumeOne = createBook("A Dawn of Lanterns", "A. Writer", "series-1", "Lux Saga", "1", "approved");

        createEdition(volumeOne, "Standard");
        createEdition(volumeTwo, "Collector");

        mockMvc.perform(get("/api/book-details/{bookId}/series-books", volumeTwo.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].id").value(volumeOne.getId()))
                .andExpect(jsonPath("$[0].volumeNumber").value("1"))
                .andExpect(jsonPath("$[0].current").value(false))
                .andExpect(jsonPath("$[0].editions").doesNotExist())
                .andExpect(jsonPath("$[1].id").value(volumeTwo.getId()))
                .andExpect(jsonPath("$[1].current").value(true));
    }

    @Test
    void getById_hidesPendingBooksForRegularUsersButAllowsAdmin() throws Exception {
        Book pendingBook = createBook("Hidden Arcana", "A. Writer", null, "Lux Saga", "3", "pending");

        MockHttpSession adminSession = new MockHttpSession();
        adminSession.setAttribute("username", "napolcerenaty");
        adminSession.setAttribute("role", "admin");

        mockMvc.perform(get("/api/book-details/{bookId}", pendingBook.getId()))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/book-details/{bookId}", pendingBook.getId()).session(adminSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(pendingBook.getId()));
    }

    private Book createBook(String title,
                            String author,
                            String authorId,
                            String seriesName,
                            String volumeNumber,
                            String status) {
        Book book = new Book();
        book.setTitle(title);
        book.setAuthor(author);
        book.setAuthorId(authorId);
        book.setSeriesName(seriesName);
        book.setVolumeNumber(volumeNumber);
        book.setStatus(status);
        return bookRepository.save(book);
    }

    private void createEdition(Book book, String editionName) {
        BookEdition edition = new BookEdition();
        edition.setBook(book);
        edition.setEditionName(editionName);
        bookEditionRepository.save(edition);
    }
}
