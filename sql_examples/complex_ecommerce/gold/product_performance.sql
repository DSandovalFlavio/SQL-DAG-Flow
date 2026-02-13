CREATE TABLE ecommerce_gold.product_performance AS
WITH exploded_orders AS (
    SELECT
        order_id,
        item.product_id,
        item.quantity,
        item.price
    FROM ecommerce_silver.orders_cleaned,
    UNNEST(JSON_EXTRACT_ARRAY(items)) as item
)
SELECT
    product_id,
    SUM(quantity) as units_sold,
    SUM(quantity * price) as revenue
FROM exploded_orders
GROUP BY 1;
