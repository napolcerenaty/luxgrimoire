package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.repository.AppUserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class UserCollectionControllerIT {

    @Autowired MockMvc mockMvc;
    @Autowired AppUserRepository userRepository;

    @BeforeEach
    void ensureTestUsers() {
        if (!userRepository.existsById("testuser")) {
            userRepository.save(new AppUser(
                "testuser", "testpass", "Test", "User", null,
                "testuser@example.com", "user"));
        }
    }

    // ── GET /api/user/books ────────────────────────────────────────────────────

    @Test
    void getBooks_notAuthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/user/books"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void getBooks_authenticated_returnsArray() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(get("/api/user/books").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void getBooks_withIsoFlag_returnsArray() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(get("/api/user/books?flag=ISO").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    @Test
    void getBooks_withInterestedFlag_returnsArray() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(get("/api/user/books?flag=INTERESTED").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    // ── POST /api/user/books ───────────────────────────────────────────────────

    @Test
    void addBook_notAuthenticated_returns401() throws Exception {
        mockMvc.perform(post("/api/user/books")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"b1\",\"editionId\":\"e1\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void addBook_missingEditionId_returns400() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(post("/api/user/books").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"b1\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void addBook_withOwnedFlag_createsOwnedEntry() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(post("/api/user/books").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"bOwned\",\"editionId\":\"eOwned\",\"flag\":\"OWNED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entry.flag").value("OWNED"));
    }

    @Test
    void addBook_withIsoFlag_createsIsoEntry() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(post("/api/user/books").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"bIso\",\"editionId\":\"eIso\",\"flag\":\"ISO\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entry.flag").value("ISO"));
    }

    @Test
    void addBook_withInterestedFlag_createsInterestedEntry() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(post("/api/user/books").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"bInt\",\"editionId\":\"eInt\",\"flag\":\"INTERESTED\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entry.flag").value("INTERESTED"));
    }

    // ── DELETE /api/user/books/{id} ────────────────────────────────────────────

    @Test
    void deleteBook_notAuthenticated_returns401() throws Exception {
        mockMvc.perform(delete("/api/user/books/some-id"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deleteBook_nonExistentEntry_returns404() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        mockMvc.perform(delete("/api/user/books/nonexistent-id").session(session))
                .andExpect(status().isNotFound());
    }

    @Test
    void addBook_thenDelete_removesEntry() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "napolcerenaty");

        // Add a book
        String addResponse = mockMvc.perform(post("/api/user/books").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"bDel\",\"editionId\":\"eDel\",\"flag\":\"OWNED\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Extract entry id from JSON
        String entryId = addResponse.split("\"id\":\"")[1].split("\"")[0];

        // Delete it
        mockMvc.perform(delete("/api/user/books/" + entryId).session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removed").value(true));
    }

    @Test
    void deleteBook_entryBelongingToOtherUser_returns404() throws Exception {
        MockHttpSession sessionUser1 = new MockHttpSession();
        sessionUser1.setAttribute("username", "napolcerenaty");

        // Add a book as user1
        String addResponse = mockMvc.perform(post("/api/user/books").session(sessionUser1)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"bookId\":\"bOther\",\"editionId\":\"eOther\",\"flag\":\"OWNED\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        String entryId = addResponse.split("\"id\":\"")[1].split("\"")[0];

        // Try to delete as admin (different user)
        MockHttpSession sessionAdmin = new MockHttpSession();
        sessionAdmin.setAttribute("username", "testuser");

        mockMvc.perform(delete("/api/user/books/" + entryId).session(sessionAdmin))
                .andExpect(status().isNotFound());
    }
}

