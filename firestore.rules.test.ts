import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Deterministic static & invariant verification suite for firestore.rules
 * covering all 12 "Dirty Dozen" adversarial scenarios and the 8 Pillars of Hardened Rules.
 */
const rulesPath = path.join(process.cwd(), 'firestore.rules');

test('Firestore security rules enforce all 8 Pillars and reject Dirty Dozen payloads', () => {
  assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
  const rules = fs.readFileSync(rulesPath, 'utf8');

  // 1. Rules Version 2 & Global Default-Deny Safety Net
  assert.match(rules, /rules_version\s*=\s*'2';/);
  assert.match(rules, /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);

  // 2. Verified Email & Admin Bootstrap Guard (Blocks Payload 3: Unverified Email Spoofing)
  assert.match(rules, /request\.auth\.token\.email_verified\s*==\s*true/);
  assert.match(rules, /rfjatt002@gmail\.com/);
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/admins\/\$\(request\.auth\.uid\)\)/);

  // 3. Strict Key Allowlists & Role Lock on User Profile (Blocks Payload 1, 2, 6)
  assert.match(rules, /function\s+isValidUserProfile\(data\)/);
  assert.match(rules, /data\.keys\(\)\.hasAll\(/);
  assert.match(rules, /data\.keys\(\)\.hasOnly\(/);
  assert.match(rules, /incoming\(\)\.role\s*==\s*'user'\s*\|\|\s*isAdmin\(\)/);
  assert.match(
    rules,
    /incoming\(\)\.diff\(existing\(\)\)\.affectedKeys\(\)\.hasOnly\(\['displayName',\s*'photoURL',\s*'updatedAt'\]\)/
  );

  // 4. PII Isolation & Secure List Query Enforcer (Blocks Payload 4, 5)
  assert.match(rules, /resource\.data\.uid\s*==\s*request\.auth\.uid\s*\|\|\s*isAdmin\(\)/);

  // 5. ID Poisoning & String Length Guards (Blocks Payload 7)
  assert.match(rules, /function\s+isValidId\(id\)/);
  assert.match(rules, /id\.matches\('\^\[a-zA-Z0-9_\\\\-\]\+\$'\)/);

  // 6. Relational Existence Check & Identity Integrity (Blocks Payload 8, 9)
  assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)/);
  assert.match(rules, /incoming\(\)\.userId\s*==\s*request\.auth\.uid/);

  // 7. Terminal State Locking on pdf_jobs (Blocks Payload 10)
  assert.match(rules, /existing\(\)\.status\s*==\s*'processing'/);

  // 8. Immutable Admin Audit Logs & Protected System Settings (Blocks Payload 11, 12)
  assert.match(rules, /match\s+\/admin_audit_logs\/\{logId\}/);
  assert.match(rules, /allow\s+update,\s*delete:\s*if\s+false;/);
  assert.match(rules, /match\s+\/system_settings\/\{settingId\}/);
});
