package io.atomity.blogcms;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Real Postgres for tests (not H2): the schema will rely on Postgres-only
 * types such as jsonb and tsvector, which H2 cannot emulate.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer<?> postgresContainer() {
        // Allow another Postgres 16 variant on hosts that cannot run Alpine images.
        return new PostgreSQLContainer<>(System.getenv().getOrDefault("TEST_POSTGRES_IMAGE", "postgres:16-alpine"));
    }
}
