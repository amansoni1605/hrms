/**
 * Next.js Instrumentation — runs at server startup before any route is handled.
 * This is the ONLY correct place to call registerGlobalTenantPlugin() because it
 * must execute before any mongoose.model() call compiles a schema.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerGlobalTenantPlugin } = await import('./infrastructure/multiTenantCore');
    registerGlobalTenantPlugin();
    console.info('[Instrumentation] ✓ Global tenant isolation plugin registered at startup.');

    // Start the payroll audit worker — Redis required (graceful degradation if absent).
    try {
      const { startPayrollAuditWorker } = await import('./lib/queues/payrollAudit');
      startPayrollAuditWorker();
    } catch (e) {
      console.warn('[Instrumentation] ⚠ Payroll audit worker not started (Redis unavailable?):', e);
    }
  }
}
