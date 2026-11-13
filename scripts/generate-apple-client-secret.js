#!/usr/bin/env node
// Generates the JWT Supabase's "Secret Key (for OAuth)" field wants for
// Sign in with Apple -- Apple doesn't hand you this directly, you sign it
// yourself with the private key from the .p8 file downloaded when you
// created the Key. Run this locally; never paste the .p8 contents or this
// output anywhere else.
//
// Usage: node scripts/generate-apple-client-secret.js
//   (edit the four values below first)
//
// Needs the `jsonwebtoken` package: npm install --no-save jsonwebtoken

const fs = require('fs')
const jwt = require('jsonwebtoken')

const TEAM_ID = 'YOUR_TEAM_ID' // Membership page, top right
const KEY_ID = 'YOUR_KEY_ID' // shown when you created the Key
const CLIENT_ID = 'com.prophandld.web' // your Services ID from step 1
const PRIVATE_KEY_PATH = './AuthKey_XXXXXXXXXX.p8' // the downloaded file

const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8')

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d', // Apple's own max is 6 months -- matches the "expires every 6 months" warning in Supabase's UI; set a calendar reminder to regenerate before this runs out
  issuer: TEAM_ID,
  audience: 'https://appleid.apple.com',
  subject: CLIENT_ID,
  keyid: KEY_ID,
})

console.log(token)
