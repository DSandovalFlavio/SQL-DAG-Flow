CREATE VIEW ecommerce_silver.orders_cleaned AS
SELECT
    o.order_id,
    o.user_id,
    CAST(o.order_date AS DATETIME) as order_timestamp,
    o.total_amount,
    o.status,
    u.country
FROM ecommerce_bronze.orders_raw o
LEFT JOIN ecommerce_bronze.users_raw u ON o.user_id = u.user_id
WHERE o.status != 'CANCELLED';
