-- Track the actual rupee amount raised by each need and keep progress in sync
-- with every successful simulated payment.
ALTER TABLE public.needs
  ADD COLUMN IF NOT EXISTS raised_amount_inr bigint NOT NULL DEFAULT 0;

WITH need_totals AS (
  SELECT
    n.id,
    COALESCE(NULLIF(regexp_replace(COALESCE(n.amount, ''), '[^0-9]', '', 'g'), ''), '0')::bigint AS target_amount_inr,
    ROUND(
      COALESCE(NULLIF(regexp_replace(COALESCE(n.amount, ''), '[^0-9]', '', 'g'), ''), '0')::numeric
      * n.raised::numeric / 100
    )::bigint AS baseline_raised_inr,
    COALESCE((
      SELECT SUM(d.amount_inr)::bigint
      FROM public.donation_intents d
      WHERE d.need_id = n.id AND d.payment_status = 'demo_paid'
    ), 0) AS prior_demo_payments_inr
  FROM public.needs n
)
UPDATE public.needs n
SET
  raised_amount_inr = t.baseline_raised_inr + t.prior_demo_payments_inr,
  raised = CASE
    WHEN t.target_amount_inr > 0
      THEN LEAST(100, ROUND((t.baseline_raised_inr + t.prior_demo_payments_inr)::numeric * 100 / t.target_amount_inr)::integer)
    ELSE n.raised
  END,
  updated_at = now()
FROM need_totals t
WHERE n.id = t.id;

CREATE OR REPLACE FUNCTION public.record_demo_payment(p_need_id bigint, p_amount_inr integer)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_need public.needs%ROWTYPE;
  v_target_amount_inr bigint;
  v_new_raised_amount_inr bigint;
  v_new_raised_percent integer;
  v_donation_id uuid;
BEGIN
  IF p_need_id IS NULL OR p_amount_inr IS NULL OR p_amount_inr < 1 OR p_amount_inr > 1000000 THEN
    RAISE EXCEPTION 'Choose a valid need and a whole-number amount.' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_need
  FROM public.needs
  WHERE id = p_need_id AND status = 'published'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This need is no longer available.' USING ERRCODE = 'P0002';
  END IF;

  v_target_amount_inr := NULLIF(regexp_replace(COALESCE(v_need.amount, ''), '[^0-9]', '', 'g'), '')::bigint;
  IF v_target_amount_inr IS NULL OR v_target_amount_inr < 1 THEN
    RAISE EXCEPTION 'This need does not have a valid target amount.' USING ERRCODE = '22023';
  END IF;

  v_new_raised_amount_inr := COALESCE(v_need.raised_amount_inr, 0) + p_amount_inr;
  v_new_raised_percent := LEAST(
    100,
    GREATEST(0, ROUND(v_new_raised_amount_inr::numeric * 100 / v_target_amount_inr)::integer)
  );

  INSERT INTO public.donation_intents (need_id, amount_inr, payment_status)
  VALUES (p_need_id, p_amount_inr, 'demo_paid')
  RETURNING id INTO v_donation_id;

  UPDATE public.needs
  SET
    raised_amount_inr = v_new_raised_amount_inr,
    raised = v_new_raised_percent,
    updated_at = now()
  WHERE id = p_need_id;

  RETURN jsonb_build_object(
    'reference', v_donation_id,
    'payment_status', 'demo_paid',
    'raised_amount_inr', v_new_raised_amount_inr,
    'raised', v_new_raised_percent
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_demo_payment(bigint, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_demo_payment(bigint, integer) TO service_role;
