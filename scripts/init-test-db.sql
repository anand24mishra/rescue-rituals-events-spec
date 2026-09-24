-- Runs once when the docker-compose PostgreSQL volume is first initialised.
-- The e2e suite truncates tables between spec files, so it needs a database
-- separate from the one used for development.
CREATE DATABASE rescue_rituals_events_test;
