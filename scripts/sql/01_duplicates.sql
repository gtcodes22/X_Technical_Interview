-- Flag repeated txn_ref: keep the first occurrence, mark later ones as duplicates.
CREATE OR REPLACE TABLE payments_dedup AS
SELECT *,
       ROW_NUMBER() OVER (PARTITION BY txn_ref ORDER BY received_at, row_id) AS occurrence,
       FIRST_VALUE(row_id) OVER (PARTITION BY txn_ref ORDER BY received_at, row_id) AS first_row_id
FROM payments;
