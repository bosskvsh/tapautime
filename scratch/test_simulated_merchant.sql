BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'b54350b4-4f2c-4b76-996a-4a5a3052a8f8';
SELECT o.id, o.display_id, o.customer_name, o.customer_phone, u.name as user_name, u.phone as user_phone
FROM public.orders o
LEFT JOIN public.users u ON o.customer_id = u.id
WHERE o.merchant_id = '551150fe-ca68-4254-9e2a-3c4a8aedadea'
LIMIT 3;
ROLLBACK;
