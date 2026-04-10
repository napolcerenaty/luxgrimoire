package com.luxgrimoire.backend.controller;

import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
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
@TestMethodOrder(MethodOrderer.MethodName.class)
class AuthControllerIT {

    @Autowired MockMvc mockMvc;

    // ── POST /api/auth/login ───────────────────────────────────────────────────

    @Test
    void login_validAdminCredentials_returns200() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"))
                .andExpect(jsonPath("$.firstName").value("Admin"));
    }

    @Test
    void login_validUser1Credentials_returns200() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"user1\",\"password\":\"user1\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("user1"));
    }

    @Test
    void login_invalidPassword_returns401() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void login_unknownUser_returns401() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"nobody\",\"password\":\"pass\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void login_missingPassword_returns400() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\"}"))
                .andExpect(status().isBadRequest());
    }

    // ── GET /api/auth/me ───────────────────────────────────────────────────────

    @Test
    void me_notAuthenticated_returns401() throws Exception {
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void me_authenticatedAsUser1_returnsUser1Data() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "user1");

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("user1"))
                .andExpect(jsonPath("$.firstName").exists());
    }

    @Test
    void me_authenticatedAsAdmin_returnsAdminData() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "admin");

        mockMvc.perform(get("/api/auth/me").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("admin"));
    }

    // ── POST /api/auth/logout ──────────────────────────────────────────────────

    @Test
    void logout_authenticated_returns200() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "admin");

        mockMvc.perform(post("/api/auth/logout").session(session))
                .andExpect(status().isOk());
    }

    // ── PUT /api/auth/profile ──────────────────────────────────────────────────

    @Test
    void updateProfile_notAuthenticated_returns401() throws Exception {
        mockMvc.perform(put("/api/auth/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"Test\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void updateProfile_authenticated_updatesFirstName() throws Exception {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute("username", "admin");

        mockMvc.perform(put("/api/auth/profile").session(session)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"firstName\":\"UpdatedAdmin\",\"lastName\":\"User\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.firstName").value("UpdatedAdmin"));
    }
}
