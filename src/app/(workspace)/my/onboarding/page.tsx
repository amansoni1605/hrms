'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare, Square, Loader2, UserCheck, BookOpen, ArrowRight } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import Link from 'next/link';

interface OnboardTask {
  _id: string; title: string; category: string;
  assignedTo: string; status: string; completedAt?: string;
}
interface Onboarding {
  _id: string; status: string; tasks: OnboardTask[];
  startDate: string; targetCompletionDate: string;
  completedAt?: string; completionTriggerFired: boolean;
}

const CATEGORY_COLOR: Record<string, string> = {
  documentation: '#E8EEF5',
  it_setup:      '#FFF3CD',
  training:      '#EEF0FF',
  orientation:   'var(--color-semantics-green-1)',
  compliance:    '#FFF3CD',
  cultural:      '#F6EDF9',
  other:         '#F5F5F5',
};
const CATEGORY_FG: Record<string, string> = {
  documentation: 'var(--color-vr-blue-6)',
  it_setup:      '#856404',
  training:      '#5b4fcf',
  orientation:   'var(--color-semantics-green-7)',
  compliance:    '#856404',
  cultural:      '#783489',
  other:         'var(--color-neutral-7)',
};
const ASSIGNEE_LABEL: Record<string, string> = {
  employee: 'You', hr: 'HR Team', it: 'IT Team', manager: 'Manager',
};

export default function MyOnboardingPage() {
  const toast = useToast();
  const [record,   setRecord]   = useState<Onboarding | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/me/onboarding');
    const json = await res.json();
    setRecord(json.data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleTask = async (taskId: string, currentStatus: string, assignedTo: string) => {
    if (assignedTo !== 'employee') return; // can only self-complete employee tasks
    setUpdating(taskId);
    await fetch('/api/me/onboarding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId,
        taskStatus: currentStatus === 'completed' ? 'pending' : 'completed',
      }),
    });
    setUpdating(null);
    toast.push({ kind: 'success', title: currentStatus === 'completed' ? 'Task marked pending' : 'Task completed' });
    load();
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-vr-blue-6)' }} />
      </div>
    );
  }

  if (!record) {
    return (
      <div style={{ padding: '2rem', maxWidth: 700 }}>
        <div className="hrms-card" style={{ padding: '3rem', textAlign: 'center' }}>
          <UserCheck size={40} style={{ color: 'var(--color-neutral-5)', marginBottom: '1rem' }} />
          <p style={{ margin: '0 0 0.4rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-16)', color: 'var(--color-neutral-10)' }}>
            No onboarding record found
          </p>
          <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-13)' }}>
            Your HR team will set up your onboarding checklist. Check back soon.
          </p>
        </div>
      </div>
    );
  }

  const done    = record.tasks.filter((t) => t.status === 'completed').length;
  const total   = record.tasks.length;
  const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
  const myTasks = record.tasks.filter((t) => t.assignedTo === 'employee');
  const otherTasks = record.tasks.filter((t) => t.assignedTo !== 'employee');

  const statusColor = record.status === 'completed'
    ? 'var(--color-semantics-green-7)'
    : record.status === 'in_progress' ? '#856404' : 'var(--color-neutral-7)';

  return (
    <div style={{ padding: '2rem', maxWidth: 720 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.6rem' }}>
        <h2 style={{ margin: '0 0 0.2rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-20)', color: 'var(--color-neutral-10)' }}>
          My Onboarding
        </h2>
        <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
          Complete these tasks to finish your onboarding
        </p>
      </div>

      {/* Progress card */}
      <div className="hrms-card" style={{ padding: '1.4rem 1.6rem', marginBottom: '1.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
          <div>
            <span style={{ fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-24)', color: statusColor }}>
              {pct}%
            </span>
            <span style={{ color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)', marginLeft: 8 }}>
              {done} of {total} tasks complete
            </span>
          </div>
          <span style={{
            padding: '0.3rem 0.9rem', borderRadius: 99,
            background: record.status === 'completed' ? 'var(--color-semantics-green-1)' : record.status === 'in_progress' ? '#FFF3CD' : '#F5F5F5',
            color: statusColor,
            fontSize: 11, fontFamily: 'var(--font-in-sb)', fontWeight: 600, textTransform: 'capitalize',
          }}>
            {record.status.replace(/_/g, ' ')}
          </span>
        </div>
        <div style={{ height: 8, background: 'var(--color-stroke)', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 99,
            background: pct === 100 ? 'var(--color-semantics-green-7)' : 'var(--color-vr-blue-6)',
            transition: 'width 400ms ease',
          }} />
        </div>
        {record.status === 'completed' && (
          <div style={{ marginTop: '1rem', padding: '0.8rem 1rem', borderRadius: '0.6rem', background: 'var(--color-semantics-green-1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-semantics-green-7)', fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-13)' }}>
              🎉 Onboarding complete! You are now enrolled in mandatory training.
            </span>
            <Link href="/training" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-vr-blue-6)', fontSize: 'var(--text-fs-12)', fontWeight: 600, textDecoration: 'none' }}>
              Go to Training <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </div>

      {/* My tasks */}
      <h3 style={{ margin: '0 0 0.8rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
        Your Tasks
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.6rem' }}>
        {myTasks.map((task) => {
          const isDone = task.status === 'completed';
          return (
            <div
              key={task._id}
              onClick={() => toggleTask(task._id, task.status, task.assignedTo)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.8rem',
                padding: '0.8rem 1rem', borderRadius: '0.8rem', cursor: 'pointer',
                background: isDone ? 'var(--color-semantics-green-1)' : 'var(--color-neutral-2)',
                border: `1px solid ${isDone ? 'var(--color-semantics-green-3)' : 'var(--color-stroke)'}`,
                transition: 'background 150ms ease',
              }}
            >
              {updating === task._id
                ? <Loader2 size={18} className="animate-spin" style={{ flexShrink: 0, color: 'var(--color-vr-blue-6)' }} />
                : isDone
                ? <CheckSquare size={18} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
                : <Square size={18} style={{ color: 'var(--color-neutral-5)', flexShrink: 0 }} />
              }
              <span style={{
                flex: 1, fontSize: 'var(--text-fs-13)', fontFamily: 'var(--font-in-sb)', fontWeight: 500,
                color: isDone ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-10)',
                textDecoration: isDone ? 'line-through' : 'none',
              }}>
                {task.title}
              </span>
              <span style={{
                padding: '0.15rem 0.6rem', borderRadius: 99, fontSize: 10, fontFamily: 'var(--font-in-sb)', fontWeight: 600, flexShrink: 0,
                background: CATEGORY_COLOR[task.category] ?? '#F5F5F5',
                color: CATEGORY_FG[task.category] ?? 'var(--color-neutral-7)',
              }}>
                {task.category.replace(/_/g, ' ')}
              </span>
            </div>
          );
        })}
        {myTasks.length === 0 && (
          <p style={{ color: 'var(--color-neutral-6)', fontSize: 'var(--text-fs-12)', margin: 0 }}>No tasks assigned to you.</p>
        )}
      </div>

      {/* Tasks assigned to others */}
      {otherTasks.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 0.8rem', fontFamily: 'var(--font-jk-bd)', fontWeight: 700, fontSize: 'var(--text-fs-14)', color: 'var(--color-neutral-10)' }}>
            Pending from Others
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1.6rem' }}>
            {otherTasks.map((task) => {
              const isDone = task.status === 'completed';
              return (
                <div key={task._id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.8rem',
                  padding: '0.7rem 1rem', borderRadius: '0.8rem',
                  background: isDone ? 'var(--color-semantics-green-1)' : 'var(--color-neutral-2)',
                  border: `1px solid ${isDone ? 'var(--color-semantics-green-3)' : 'var(--color-stroke)'}`,
                  opacity: isDone ? 1 : 0.75,
                }}>
                  {isDone
                    ? <CheckSquare size={16} style={{ color: 'var(--color-semantics-green-7)', flexShrink: 0 }} />
                    : <Square size={16} style={{ color: 'var(--color-neutral-5)', flexShrink: 0 }} />
                  }
                  <span style={{
                    flex: 1, fontSize: 'var(--text-fs-12)', color: isDone ? 'var(--color-semantics-green-7)' : 'var(--color-neutral-8)',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}>{task.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--color-neutral-6)', flexShrink: 0 }}>
                    {ASSIGNEE_LABEL[task.assignedTo] ?? task.assignedTo}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Next step CTA */}
      {record.completionTriggerFired && (
        <div className="hrms-card" style={{ padding: '1.2rem 1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <BookOpen size={20} style={{ color: 'var(--color-vr-blue-6)', flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontFamily: 'var(--font-in-sb)', fontWeight: 600, fontSize: 'var(--text-fs-13)', color: 'var(--color-neutral-10)' }}>
                Training programs are ready
              </p>
              <p style={{ margin: 0, color: 'var(--color-neutral-7)', fontSize: 'var(--text-fs-12)' }}>
                You have been enrolled in mandatory training. Complete them to proceed.
              </p>
            </div>
          </div>
          <Link
            href="/training"
            className="hrms-btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', flexShrink: 0 }}
          >
            View Training <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}
