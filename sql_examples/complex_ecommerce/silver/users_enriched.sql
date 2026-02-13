CREATE TABLE ecommerce_silver.users_enriched AS
SELECT
    u.user_id,
    u.email,
    u.signup_date,
    u.country,
    CASE 
        WHEN u.country = 'US' THEN 'North America'
        WHEN u.country IN ('UK', 'DE', 'FR') THEN 'Europe'
        ELSE 'Rest of World'
    END as region
FROM ecommerce_bronze.users_raw u;
