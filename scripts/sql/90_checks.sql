-- Data-quality assertions. Each query MUST return zero rows, or the ingest stops.

-- check: payment allocated more than once
SELECT row_id FROM allocations GROUP BY row_id HAVING COUNT(*) > 1;

-- check: every payment has an allocation row
SELECT row_id FROM payments WHERE row_id NOT IN (SELECT row_id FROM allocations);

-- check: allocation points at an unknown loan
SELECT a.row_id FROM allocations a LEFT JOIN loans l USING (loan_id)
WHERE a.loan_id IS NOT NULL AND l.loan_id IS NULL;

-- check: matched payments must have a loan and a positive amount
SELECT a.row_id FROM allocations a JOIN payments p USING (row_id)
WHERE a.status = 'matched' AND (a.loan_id IS NULL OR p.amount_thebe IS NULL OR p.amount_thebe <= 0);

-- check: balance identity (outstanding = remaining instalments + penalties), within P1
SELECT loan_id FROM loans
WHERE abs(outstanding_balance_thebe
          - ((term_months - instalments_paid) * monthly_instalment_thebe + penalties_thebe)) > 100;

-- check: every loan has a usable phone and 4-digit id
SELECT loan_id FROM loans
WHERE phone_normalised IS NULL OR NOT regexp_full_match(id_last4, '\d{4}');
