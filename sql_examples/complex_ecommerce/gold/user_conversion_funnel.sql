CREATE TABLE ecommerce_gold.user_conversion_funnel AS
SELECT
    s.user_id,
    COUNT(DISTINCT s.session_id) as total_sessions,
    COUNT(DISTINCT o.order_id) as total_orders,
    IFNULL(COUNT(DISTINCT o.order_id) / NULLIF(COUNT(DISTINCT s.session_id), 0), 0) as conversion_rate
FROM ecommerce_silver.sessions s
LEFT JOIN ecommerce_silver.orders_cleaned o ON s.user_id = o.user_id AND o.order_timestamp BETWEEN s.session_start AND s.session_end
GROUP BY 1;
