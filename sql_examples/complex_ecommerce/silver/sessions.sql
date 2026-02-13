CREATE OR REPLACE TABLE ecommerce_silver.sessions AS
WITH logs AS (
    SELECT * FROM ecommerce_bronze.web_logs
)
SELECT
    user_id,
    session_id,
    MIN(timestamp) as session_start,
    MAX(timestamp) as session_end,
    COUNT(*) as page_views
FROM logs
GROUP BY user_id, session_id;
