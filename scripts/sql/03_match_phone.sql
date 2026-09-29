-- Fallback for payments with no usable reference: payer phone -> loans.
-- Never 'matched': a phone alone is a candidate for staff review only.
CREATE OR REPLACE TABLE phone_matches AS
WITH candidates AS (
  SELECT p.row_id, l.loan_id,
         COUNT(*) OVER (PARTITION BY p.row_id) AS n_loans
  FROM payments_dedup p
  JOIN loans l ON l.phone_normalised = p.payer_phone_normalised
  WHERE p.occurrence = 1
    AND p.row_id NOT IN (SELECT row_id FROM ref_matches)
)
SELECT row_id,
       CASE WHEN n_loans = 1 THEN loan_id END AS loan_id,
       'needs_review' AS status,
       'phone' AS method,
       CASE WHEN n_loans = 1 THEN 'no reference; payer phone matches ' || loan_id
            ELSE 'no reference; payer phone matches ' || n_loans || ' loans' END AS reason
FROM candidates
QUALIFY ROW_NUMBER() OVER (PARTITION BY row_id ORDER BY loan_id) = 1;
