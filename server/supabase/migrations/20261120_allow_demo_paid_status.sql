-- Adds an explicitly simulated success state for the public demo checkout.
-- This state must not be represented as a real financial payment.
alter table public.donation_intents
  drop constraint if exists donation_intents_payment_status_check;

alter table public.donation_intents
  add constraint donation_intents_payment_status_check
  check (payment_status in ('not_started', 'pending', 'paid', 'demo_paid', 'failed', 'refunded'));
