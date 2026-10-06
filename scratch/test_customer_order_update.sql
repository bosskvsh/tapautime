BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '4196227d-a0a1-456c-9610-475edd2270f9';
UPDATE public.orders
SET customer_phone = '+60149191830'
WHERE customer_id = '4196227d-a0a1-456c-9610-475edd2270f9';
SELECT id, customer_phone FROM public.orders WHERE customer_id = '4196227d-a0a1-456c-9610-475edd2270f9' LIMIT 3;
ROLLBACK;
