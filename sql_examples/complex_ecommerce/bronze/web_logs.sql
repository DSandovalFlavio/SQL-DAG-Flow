CREATE TABLE ecommerce_bronze.web_logs (
    log_id STRING,
    user_id STRING,
    timestamp TIMESTAMP,
    page_url STRING,
    interaction_type STRING,
    device_type STRING
)
PARTITION BY DATE(timestamp);
