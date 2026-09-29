-- Counts and totals by status, for manifest.json and the console report.
CREATE OR REPLACE TABLE allocation_summary AS
SELECT a.status,
       COUNT(*) AS payments,
       SUM(p.amount_thebe) AS amount_thebe
FROM allocations a
JOIN payments p USING (row_id)
GROUP BY a.status
ORDER BY a.status;
