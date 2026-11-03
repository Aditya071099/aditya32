package io.atomity.blogcms.auth;

import io.atomity.blogcms.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class AuthApiTest extends IntegrationTest {

    @Test
    void loginWithAdminCredentialsReturnsToken() throws Exception {
        mockMvc.perform(login("ADMIN@test.local", ADMIN_PASSWORD, "192.0.2.1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.expiresAt").isNotEmpty());
    }

    @Test
    void wrongPasswordIsRejectedWithoutSayingWhichFieldWasWrong() throws Exception {
        mockMvc.perform(login(ADMIN_EMAIL, "nope", "192.0.2.2"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errors[0].errorCode").value("INVALID_CREDENTIALS"))
                .andExpect(jsonPath("$.errors[0].message").value("Wrong email or password"));
    }

    @Test
    void repeatedFailuresAreRateLimitedPerClient() throws Exception {
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(login(ADMIN_EMAIL, "nope", "192.0.2.3")).andExpect(status().isUnauthorized());
        }
        // Even the right password is refused while the client is locked out...
        mockMvc.perform(login(ADMIN_EMAIL, ADMIN_PASSWORD, "192.0.2.3"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errors[0].errorCode").value("TOO_MANY_ATTEMPTS"));
        // ...but other clients are unaffected.
        mockMvc.perform(login(ADMIN_EMAIL, ADMIN_PASSWORD, "192.0.2.4")).andExpect(status().isOk());
    }

    @Test
    void forgedForwardedHeadersCannotBypassRateLimit() throws Exception {
        String actualClientIp = "192.0.2.50";

        for (int i = 1; i <= 5; i++) {
            mockMvc.perform(login(ADMIN_EMAIL, "nope", actualClientIp)
                            .header("X-Forwarded-For", "198.51.100." + i))
                    .andExpect(status().isUnauthorized());
        }

        mockMvc.perform(login(ADMIN_EMAIL, ADMIN_PASSWORD, actualClientIp)
                        .header("X-Forwarded-For", "203.0.113.99"))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void apiRequiresToken() throws Exception {
        mockMvc.perform(get("/api/v1/posts"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errors[0].errorCode").value("UNAUTHORIZED"));
    }

    @Test
    void forgedTokenIsRejected() throws Exception {
        String forged = token().substring(0, token().lastIndexOf('.') + 1) + "invalidsignature";
        mockMvc.perform(get("/api/v1/posts").header("Authorization", "Bearer " + forged))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void validTokenIsAccepted() throws Exception {
        call(get("/api/v1/posts")).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder login(
            String email, String password, String client) throws Exception {
        return post("/api/v1/auth/login")
                .with(request -> {
                    request.setRemoteAddr(client);
                    return request;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content(json(Map.of("email", email, "password", password)));
    }
}
