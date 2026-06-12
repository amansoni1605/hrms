import { NextResponse }           from 'next/server';
import { withFeature }           from '@/lib/featureGate';
import { WorkspaceEmployee }     from '@/models/workspace.models';

export const GET = withFeature('immigration', async () => {
  // Real digital workers from ws_employees collection
  const dbWorkers = await WorkspaceEmployee.find({
    employmentType: 'digital_worker',
    isActive:       true,
  }).lean();

  // Canonical demo AI agents (always shown)
  const stubAgents = [
    { _id: 'AGENT-001', employeeCode: 'AGENT-001', jobTitle: 'Payroll Audit Agent',     agentFramework: 'claude',  modelVersion: 'claude-sonnet-4-6', tokenBudgetMonthly: 1_000_000, tokenBudgetUsed: 245_000, apiCostMtd: 12.40, status: 'active',    supervisor: 'HR Admin', repo: 'github.com/acme/payroll-agent'    },
    { _id: 'AGENT-002', employeeCode: 'AGENT-002', jobTitle: 'Compliance Scanner',       agentFramework: 'claude',  modelVersion: 'claude-sonnet-4-6', tokenBudgetMonthly: 500_000,   tokenBudgetUsed: 88_000,  apiCostMtd: 4.20,  status: 'active',    supervisor: 'HR Admin', repo: 'github.com/acme/compliance-agent' },
    { _id: 'AGENT-003', employeeCode: 'AGENT-003', jobTitle: 'Onboarding Orchestrator', agentFramework: 'openai',  modelVersion: 'gpt-4o',            tokenBudgetMonthly: 750_000,   tokenBudgetUsed: 510_000, apiCostMtd: 31.80, status: 'suspended', supervisor: 'CTO',      repo: 'github.com/acme/onboard-agent'   },
  ];

  return NextResponse.json({ data: [...dbWorkers, ...stubAgents] });
}, ['super_admin']);
