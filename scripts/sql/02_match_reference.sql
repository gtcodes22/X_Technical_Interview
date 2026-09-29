-- Reference join. A match only counts if the payer's name fits the borrower: the surname,
-- or the first name plus the surname initial ("KEITUMETSE M" for Keitumetse Modise).
-- Otherwise it's a likely wrong/transposed reference and goes to a human.
CREATE OR REPLACE TABLE ref_matches AS
WITH joined AS (
  SELECT p.*, l.loan_id, l.first_name, l.last_name,
         upper(p.payer_name) LIKE '%' || upper(l.last_name) || '%'
         OR (upper(p.payer_name) LIKE '%' || upper(l.first_name) || '%'
             AND regexp_matches(upper(p.payer_name), '\b' || upper(left(l.last_name, 1)) || '\b')) AS name_ok
  FROM payments_dedup p
  JOIN loans l ON l.loan_id = p.reference_normalised
  WHERE p.occurrence = 1
)
SELECT p.row_id,
       p.loan_id,
       CASE WHEN p.name_ok THEN 'matched' ELSE 'needs_review' END AS status,
       'reference' AS method,
       CASE WHEN p.name_ok THEN 'reference and payer name match'
            ELSE 'reference ' || p.loan_id || ' belongs to ' || p.first_name || ' ' || p.last_name
                 || ' but payer is ' || p.payer_name END AS reason
FROM joined p;
