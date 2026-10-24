import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Account, Role } from './accounts';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — is .env.local present at the repo root?`);
  }
  return value;
}

/**
 * A fresh, authenticated Supabase client for one role — direct DB access,
 * no browser. RLS is enforced by Postgres on the session's JWT regardless
 * of which client asks, so this is the right tool for proving a policy
 * actually blocks something, rather than just that the UI doesn't show it.
 */
export async function supabaseAs(role: Role, account: Account): Promise<SupabaseClient> {
  const client = createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error(`Could not sign in as ${role} (${account.email}): ${error.message}`);
  return client;
}
