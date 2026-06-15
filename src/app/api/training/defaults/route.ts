import { NextResponse }              from 'next/server';
import { withRoute }                 from '@/lib/withRoute';
import { WorkspaceTrainingProgram }  from '@/models/workspace.models';
import { TenantContext }             from '@/infrastructure/multiTenantCore';

// Default training catalog — seeded once per tenant on demand.
// Mandatory programs auto-enroll every new hire when onboarding completes.
const DEFAULT_PROGRAMS: Array<{
  title:         string;
  description:   string;
  trainer:       string;
  category:      'compliance' | 'technical' | 'leadership' | 'soft_skills' | 'other';
  durationHours: number;
  maxEnrollment: number;
  isMandatory:   boolean;
}> = [
  // ── Mandatory compliance ──────────────────────────────────────────────────
  {
    title:         'POSH Awareness Training',
    description:   'Prevention of Sexual Harassment at Workplace Act, 2013 — mandatory annual awareness programme covering definitions, reporting mechanisms, Internal Complaints Committee (ICC) process, and employee rights.',
    trainer:       'HR & Legal Team',
    category:      'compliance',
    durationHours: 2,
    maxEnrollment: 100,
    isMandatory:   true,
  },
  {
    title:         'Information Security & Data Privacy',
    description:   "Covers data classification, safe handling of PII and sensitive business data, password hygiene, phishing awareness, incident reporting procedures, and obligations under India's DPDP Act 2023.",
    trainer:       'IT Security Team',
    category:      'compliance',
    durationHours: 3,
    maxEnrollment: 100,
    isMandatory:   true,
  },
  {
    title:         'Code of Conduct & Business Ethics',
    description:   'Company values, conflict of interest policy, confidentiality obligations, social media guidelines, insider trading prohibitions, and whistleblower protection framework.',
    trainer:       'HR & Legal Team',
    category:      'compliance',
    durationHours: 2,
    maxEnrollment: 100,
    isMandatory:   true,
  },
  {
    title:         'Anti-Bribery & Anti-Corruption (ABAC)',
    description:   'Overview of the Prevention of Corruption Act, global standards (FCPA / UK Bribery Act for cross-border teams), gift and entertainment policies, third-party due diligence, and reporting obligations.',
    trainer:       'Finance & Legal Team',
    category:      'compliance',
    durationHours: 2,
    maxEnrollment: 100,
    isMandatory:   true,
  },
  {
    title:         'Diversity, Equity & Inclusion Foundations',
    description:   'Understanding unconscious bias, inclusive communication, accessibility awareness, building equitable hiring and collaboration practices, and allyship at the workplace.',
    trainer:       'HR Team',
    category:      'soft_skills',
    durationHours: 2,
    maxEnrollment: 100,
    isMandatory:   true,
  },

  // ── Technical orientation ─────────────────────────────────────────────────
  {
    title:         'Internal Systems & Tools Orientation',
    description:   "Hands-on walkthrough of the company's core internal platforms — HRMS, ticketing system, project management tools, communication stack, and expense management. Includes IT access request workflow.",
    trainer:       'IT & Operations Team',
    category:      'technical',
    durationHours: 3,
    maxEnrollment: 30,
    isMandatory:   false,
  },
  {
    title:         'Data Handling & Document Management',
    description:   'Best practices for version control of business documents, file naming conventions, approved cloud storage and sharing policies, data retention schedules, and secure disposal of confidential data.',
    trainer:       'IT & Operations Team',
    category:      'technical',
    durationHours: 2,
    maxEnrollment: 50,
    isMandatory:   false,
  },

  // ── Soft skills ───────────────────────────────────────────────────────────
  {
    title:         'Business Communication & Presentation',
    description:   'Structured written communication (emails, reports, proposals), active listening, meeting facilitation, slide design principles, and delivering persuasive presentations to internal and external audiences.',
    trainer:       'L&D Team',
    category:      'soft_skills',
    durationHours: 4,
    maxEnrollment: 25,
    isMandatory:   false,
  },
  {
    title:         'Time Management & Productivity',
    description:   'Prioritisation frameworks (Eisenhower Matrix, Time-blocking), managing attention in a hybrid environment, saying no effectively, delegation basics, and building sustainable work habits.',
    trainer:       'L&D Team',
    category:      'soft_skills',
    durationHours: 2,
    maxEnrollment: 50,
    isMandatory:   false,
  },

  // ── Leadership ────────────────────────────────────────────────────────────
  {
    title:         'People Management Essentials',
    description:   'Core skills for new and developing managers: goal-setting with teams, delegation and accountability, situational leadership styles, employee motivation, handling underperformance early, and legal obligations as a people manager.',
    trainer:       'L&D Team',
    category:      'leadership',
    durationHours: 8,
    maxEnrollment: 20,
    isMandatory:   false,
  },
  {
    title:         'Effective Performance Conversations',
    description:   'How to conduct structured 1:1s, give and receive candid feedback using the SBI model, set SMART objectives, document performance concerns, and prepare for annual appraisal cycles.',
    trainer:       'L&D Team',
    category:      'leadership',
    durationHours: 4,
    maxEnrollment: 25,
    isMandatory:   false,
  },
  {
    title:         'Hiring & Interviewing Best Practices',
    description:   'Structured interview design, behavioural and situational questioning (STAR method), bias mitigation in candidate evaluation, compliant reference checking, and offer negotiation guidelines.',
    trainer:       'Talent Acquisition Team',
    category:      'leadership',
    durationHours: 3,
    maxEnrollment: 20,
    isMandatory:   false,
  },
];

// POST /api/training/defaults
// Idempotent — skips any program whose title already exists in the tenant.
export const POST = withRoute(async () => {
  const ctx = TenantContext.requireStore('POST /api/training/defaults');

  const existing = await WorkspaceTrainingProgram.find({ tenantId: ctx.tenantId })
    .select('title')
    .lean();
  const existingTitles = new Set(existing.map((p) => p.title));

  const toCreate = DEFAULT_PROGRAMS.filter((p) => !existingTitles.has(p.title));

  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0, skipped: DEFAULT_PROGRAMS.length, message: 'All default programs already exist.' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (WorkspaceTrainingProgram as any).insertMany(
    toCreate.map((p) => ({
      ...p,
      tenantId:   ctx.tenantId,
      status:     'draft',
      enrollments: [],
      createdById: ctx.userId,
    })),
    { ordered: false },
  );

  return NextResponse.json({
    created:  toCreate.length,
    skipped:  DEFAULT_PROGRAMS.length - toCreate.length,
    programs: toCreate.map((p) => ({ title: p.title, category: p.category, isMandatory: p.isMandatory })),
  }, { status: 201 });
}, ['super_admin', 'hr_admin']);
