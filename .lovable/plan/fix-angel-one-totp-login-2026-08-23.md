# Fix Angel One TOTP login

## Goal
Allow Angel One login with the 6-digit TOTP shown in the authenticator, while preserving optional automatic daily reconnect when a Base32 TOTP secret is provided.

## Implementation
1. Update the Angel One form to accept either a current 6-digit TOTP code or a Base32 TOTP secret and label the field clearly.
2. Send 6-digit values as `totp` and longer Base32 values as `totpSecret`, matching the backend and SmartAPI `loginByPassword` contract.
3. Harden server-side validation and TOTP normalization so malformed codes/secrets return actionable errors rather than a generic failure.
4. Add focused tests for TOTP-code login, secret-generated login, and invalid input, then verify the broker card and build.

## Technical notes
- A one-time 6-digit code can establish the current session but cannot support automatic next-day reconnect.
- A Base32 secret remains the optional saved credential used to generate future 6-digit codes server-side.
