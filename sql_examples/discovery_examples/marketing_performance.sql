
-- This view aggregates marketing campaign performance
-- It depends on 'marketing.ad_clicks' and 'marketing.ad_impressions'
-- Both are missing from the project files.

CREATE OR REPLACE VIEW `marketing.campaign_performance` AS
SELECT
    c.campaign_id,
    COUNT(i.impression_id) as impressions,
    COUNT(cl.click_id) as clicks,
    COUNT(cl.click_id) / NULLIF(COUNT(i.impression_id), 0) as ctr
FROM
    `marketing.campaigns` c -- This might be local or missing
LEFT JOIN
    `marketing.ad_impressions` i ON c.campaign_id = i.campaign_id
LEFT JOIN
    `marketing.ad_clicks` cl ON c.campaign_id = cl.campaign_id
GROUP BY
    1
