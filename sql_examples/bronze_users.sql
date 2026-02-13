-- bronze_users.sql
CREATE OR REPLACE TABLE raw_project.raw_dataset.users AS
SELECT 
    id,
    name,
    email,
    created_at
FROM external_source.users_dump
