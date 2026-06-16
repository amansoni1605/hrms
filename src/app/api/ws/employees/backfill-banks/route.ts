/**
 * POST /api/ws/employees/backfill-banks
 *
 * Seeds dummy bank account details for every active employee that does not yet
 * have bankAccountEnc stored. Useful for demo/dev environments.
 *
 * Returns: { seeded: number, skipped: number }
 */

import { NextResponse }          from 'next/server';
import { withRoute }             from '@/lib/withRoute';
import { WorkspaceEmployee }     from '@/models/workspace.models';
import { getTenantDEK, TenantContext } from '@/infrastructure/multiTenantCore';
import { createCipheriv, randomBytes } from 'node:crypto';

function encryptStr(key: Buffer, value: string): Buffer {
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body   = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([0x01]), iv, tag, body]);
}

// Generates a plausible-looking IFSC (11-char: 4-letter bank code + 0 + 6 digits)
const BANK_CODES = ['HDFC', 'ICIC', 'SBIN', 'AXIS', 'KOTK', 'IDBI', 'PUNB'];

function fakeBankDetails(index: number): { ifsc: string; account: string } {
  const bankCode = BANK_CODES[index % BANK_CODES.length];
  const branch   = String(index + 1).padStart(6, '0');
  const ifsc     = `${bankCode}0${branch}`;
  // 11-digit account number
  const account  = String(100_000_000_00 + index * 7 + 1_234_567_890).slice(-11);
  return { ifsc, account };
}

export const POST = withRoute(
  async () => {
    const ctx = TenantContext.requireStore('backfill-banks POST');
    const { key: dekKey } = await getTenantDEK(ctx.tenantId.toString());

    const emps = await WorkspaceEmployee.find(
      { isActive: true, employeeStatus: 'active' },
    ).select('_id bankAccountEnc').lean();

    let seeded = 0;
    let skipped = 0;

    for (let i = 0; i < emps.length; i++) {
      const emp = emps[i];
      if (emp.bankAccountEnc) {
        skipped++;
        continue;
      }
      const { ifsc, account } = fakeBankDetails(i);
      await WorkspaceEmployee.findByIdAndUpdate(emp._id, {
        $set: {
          bankAccountEnc: encryptStr(dekKey, account),
          bankRoutingEnc: encryptStr(dekKey, ifsc),
          bankSwiftEnc:   encryptStr(dekKey, 'HDFCINBB'),
        },
      });
      seeded++;
    }

    return NextResponse.json({ data: { seeded, skipped } });
  },
  ['super_admin', 'hr_admin', 'payroll_officer'],
);
