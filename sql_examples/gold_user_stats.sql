-- gold_user_stats.sql
CREATE OR REPLACE TABLE analytics_project.gold_dataset.user_stats AS
SELECT 
    signup_date,
    COUNT(id) as total_users
FROM analytics_project.silver_dataset.users_cleaned
GROUP BY signup_date
