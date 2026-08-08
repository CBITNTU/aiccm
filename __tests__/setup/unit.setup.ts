// Unit tests never talk to real services. Several modules read env at import
// time (e.g. lib/db constructs a pg Pool, which never connects until first
// query), so stub the minimum here to keep imports safe.
process.env.DATABASE_URL ??=
  "postgres://test:test@localhost:5432/test_dummy";
process.env.BETTER_AUTH_SECRET ??= "test-only-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
// lib/email constructs a Resend client at import time and its constructor
// throws on a missing key. This dummy key can't authenticate, so an accidental
// send fails at the API rather than silently delivering mail.
process.env.RESEND_API_KEY ??= "re_test_dummy_key";
