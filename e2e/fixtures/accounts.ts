export type Role = 'landlord' | 'renter' | 'contractor';

export interface Account {
  email: string;
  password: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.e2e.example to .env.e2e.local and fill in the test account credentials.`
    );
  }
  return value;
}

export function account(role: Role): Account {
  const key = role.toUpperCase();
  return {
    email: requireEnv(`E2E_${key}_EMAIL`),
    password: requireEnv(`E2E_${key}_PASSWORD`),
  };
}
