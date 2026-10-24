import { test, expect } from '@playwright/test';
import { supabaseAs } from '../fixtures/supabaseClient';
import { account } from '../fixtures/accounts';

/**
 * Direct-to-Postgres checks that a signed-in user's own session genuinely
 * cannot read or write another party's data — not just that the UI doesn't
 * show it. This app has had three real RLS bugs already (chat, the
 * tenancies UPDATE policy, nested-RLS lag), so "the UI hides it" has
 * already proven not to mean "the database blocks it."
 *
 * These use the Supabase client directly, the same way any other client of
 * the public API would (not just this app's own frontend) — RLS is the
 * only thing standing between a signed-in user and someone else's row.
 */

test.describe('sealed bidding is enforced by RLS, not just the UI', () => {
  test('a renter cannot read bid amounts on their own job', async () => {
    const renter = await supabaseAs('renter', account('renter'));
    // No filter at all — if RLS is doing its job this returns zero rows
    // for a renter regardless of which job or contractor the bid belongs
    // to; a renter has no legitimate reason to see a bid amount, ever.
    const { data, error } = await renter.from('bids').select('id, amount, job_id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

test.describe('a renter cannot reach another unit\'s data through the same landlord', () => {
  test('jobs, rent payments, and documents stay scoped to the renter\'s own unit', async () => {
    const renter = await supabaseAs('renter', account('renter'));
    const { data: tenancyId } = await renter.rpc('get_my_active_tenancy_id');
    expect(tenancyId, 'renter test account has no active tenancy — fixture data may have changed').toBeTruthy();
    const { data: tenancy } = await renter.from('tenancies').select('unit_id').eq('id', tenancyId).maybeSingle();
    const ownUnitId = tenancy?.unit_id;
    expect(ownUnitId).toBeTruthy();

    const landlord = await supabaseAs('landlord', account('landlord'));
    const { data: units } = await landlord.from('units').select('id, property_id, unit_number');
    const otherUnit = (units || []).find((u) => u.id !== ownUnitId);
    test.skip(!otherUnit, 'landlord test account only has one unit — nothing to test isolation against');
    const otherUnitId = otherUnit!.id;
    const otherPropertyId = otherUnit!.property_id;
    const { data: otherTenancy } = await landlord.from('tenancies').select('id').eq('unit_id', otherUnitId).maybeSingle();

    const [jobsRes, docsRes, rentRes] = await Promise.all([
      renter.from('jobs').select('id').eq('unit_id', otherUnitId),
      renter.from('documents').select('id').eq('property_id', otherPropertyId),
      otherTenancy
        ? renter.from('rent_payments').select('id').eq('tenancy_id', otherTenancy.id)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);

    expect.soft(jobsRes.data, 'jobs on a unit the renter has no tenancy on').toEqual([]);
    expect.soft(docsRes.data, 'documents on a property the renter has no tenancy on').toEqual([]);
    expect.soft(rentRes.data, 'rent_payments on a tenancy that is not the renter\'s own').toEqual([]);
  });
});

test.describe('a contractor has no access to tenancy or rent data', () => {
  test('tenancies, rent_payments, and documents are invisible to a contractor session', async () => {
    const contractor = await supabaseAs('contractor', account('contractor'));
    const [tenanciesRes, rentRes, docsRes] = await Promise.all([
      contractor.from('tenancies').select('id'),
      contractor.from('rent_payments').select('id'),
      contractor.from('documents').select('id'),
    ]);

    expect(tenanciesRes.data).toEqual([]);
    expect(rentRes.data).toEqual([]);
    expect(docsRes.data).toEqual([]);
  });
});

test.describe('a renter cannot mark their own rent as paid', () => {
  test('writing actual_amount/paid_date directly is rejected, even on the renter\'s own tenancy', async () => {
    const renter = await supabaseAs('renter', account('renter'));
    const { data: tenancyId } = await renter.rpc('get_my_active_tenancy_id');
    const { data: payments } = await renter
      .from('rent_payments')
      .select('id, actual_amount, paid_date')
      .eq('tenancy_id', tenancyId)
      .is('actual_amount', null)
      .limit(1);
    test.skip(!payments?.length, 'no unpaid rent row on the test tenancy to attempt the write against');

    const target = payments![0];
    const { data: updated, error } = await renter
      .from('rent_payments')
      .update({ actual_amount: 1, paid_date: new Date().toISOString().slice(0, 10) })
      .eq('id', target.id)
      .select();

    // RLS on an UPDATE with no matching policy returns an empty array, not
    // an error — "Mark Received" is landlord-only, so a renter's write
    // should silently affect zero rows rather than succeed.
    expect(error).toBeNull();
    expect(updated).toEqual([]);
  });
});
