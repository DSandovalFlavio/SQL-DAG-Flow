-- silver_users_cleaned.sql
CREATE OR REPLACE VIEW analytics_project.silver_dataset.users_cleaned AS
SELECT 
    u.id,
    u.name,
    LOWER(u.email) as email,
    CAST(u.created_at AS DATE) as signup_date
FROM raw_project.raw_dataset.users u
WHERE u.email IS NOT NULL # This dependency should be detected
