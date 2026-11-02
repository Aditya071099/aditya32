-- Flyway applies this automatically on backend startup, before Hibernate validates the schema.
CREATE TABLE audiences (
    id         UUID         PRIMARY KEY,
    name       VARCHAR(100) NOT NULL,
    slug       VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_audiences_slug UNIQUE (slug)
);

-- A blog is stored in posts. Each audience can belong to only one group per post.
CREATE TABLE post_audiences (
    post_id       UUID        NOT NULL REFERENCES posts (id) ON DELETE CASCADE,
    audience_id   UUID        NOT NULL REFERENCES audiences (id) ON DELETE CASCADE,
    audience_type VARCHAR(20) NOT NULL,
    PRIMARY KEY (post_id, audience_id),
    CONSTRAINT ck_post_audiences_type CHECK (audience_type IN ('PRIMARY', 'SECONDARY'))
);

CREATE INDEX idx_post_audiences_audience_id ON post_audiences (audience_id);
