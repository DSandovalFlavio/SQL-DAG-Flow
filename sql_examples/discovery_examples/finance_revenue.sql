
-- This query calculates monthly revenue
-- It depends on 'finance.raw_payments' which DOES NOT exist in this project.
-- Discovery Mode should detect 'finance.raw_payments' as an external node.

CREATE OR REPLACE TABLE `finance.monthly_revenue` AS
SELECT
    DATE_TRUNC(payment_date, MONTH) as month,
    SUM(amount) as total_revenue
FROM
    `finance.raw_payments`
GROUP BY
    1
