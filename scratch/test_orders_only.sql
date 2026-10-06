BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'b54350b4-4f2c-4b76-996a-4a5a3052a8f8';

SELECT o.id, o.display_id, o.merchant_id, o.customer_id, o.customer_name, o.customer_phone, o.status, o.payment_status, o.payment_method
FROM public.orders o
WHERE o.merchant_id = '551150fe-ca68-4254-9e2a-3c4a8aedadea'
  AND (o.payment_method = 'cash' OR o.payment_status = 'captured')
  AND o.status != 'pending_payment'
ORDER BY o.created_at DESC
LIMIT 5;

ROLLBACK;
