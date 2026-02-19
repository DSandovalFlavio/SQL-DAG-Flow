
-- Logistics unexpected delays report
-- References 'logistics.shipments' (missing)

SELECT
    shipment_id,
    origin,
    destination,
    delay_hours
FROM
    `logistics.shipments`
WHERE
    status = 'DELAYED'
