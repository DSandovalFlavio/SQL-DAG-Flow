CREATE TABLE ecommerce_gold.daily_revenue AS
SELECT
    DATE(order_timestamp) as order_date,
    country,
    SUM(total_amount) as revenue,
    COUNT(DISTINCT order_id) as total_orders
FROM ecommerce_silver.orders_cleaned
WHERE status = 'COMPLETED'
GROUP BY 1, 2;
