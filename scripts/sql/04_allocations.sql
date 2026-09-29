-- One row per payment with its final status.
CREATE OR REPLACE TABLE allocations AS
SELECT p.row_id,
       COALESCE(r.loan_id, ph.loan_id) AS loan_id,
       CASE WHEN p.occurrence > 1 THEN 'duplicate'
            ELSE COALESCE(r.status, ph.status, 'unmatched') END AS status,
       CASE WHEN p.occurrence > 1 THEN 'none'
            ELSE COALESCE(r.method, ph.method, 'none') END AS method,
       CASE WHEN p.occurrence > 1 THEN 'repeat of ' || p.txn_ref || ' (first seen as row ' || p.first_row_id || ')'
            ELSE COALESCE(r.reason, ph.reason, 'no usable reference or phone match') END AS reason
FROM payments_dedup p
LEFT JOIN ref_matches r ON r.row_id = p.row_id AND p.occurrence = 1
LEFT JOIN phone_matches ph ON ph.row_id = p.row_id AND p.occurrence = 1;
