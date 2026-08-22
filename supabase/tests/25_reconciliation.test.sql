-- 25_reconciliation.test.sql
-- Sprint Directive 2.1 §2.3 claim_settlement replay safety (structure).

begin;

select plan(3);

select has_table('public', 'settlement_claims', 'settlement_claims exists');

select has_function(
  'public',
  'claim_settlement',
  array['uuid', 'text', 'uuid', 'uuid'],
  'claim_settlement(uuid,text,uuid,uuid) exists'
);

select has_function(
  'public',
  'unwind_settlement_parent',
  array['uuid'],
  'unwind_settlement_parent exists'
);

select * from finish();
rollback;
