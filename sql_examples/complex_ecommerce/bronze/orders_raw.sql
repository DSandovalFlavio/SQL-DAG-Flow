CREATE TABLE ecommerce_bronze.orders_raw (
    order_id STRING,
    user_id STRING,
    order_date TIMESTAMP,
    total_amount FLOAT,
    status STRING,
    items JSON
);
