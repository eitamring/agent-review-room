import { useState, useEffect, type MutableRefObject } from 'react';
import type { ReviewSession, ReviewerRole, ReviewTarget, LLMProvider } from '../../../../shared/types';
import styles from './setup.module.css';

type SetupScreenProps = {
  onStart: (session: ReviewSession) => void;
  onResumeSession: (session: ReviewSession) => void;
  submitRef?: MutableRefObject<(() => void) | null>;
};

type ReviewerDraft = {
  id: string;
  provider: LLMProvider;
  model: string;
  role: ReviewerRole;
  customTitle: string;
  customDesc: string;
  skillFile: string;
};

const PROVIDERS: { value: LLMProvider; label: string }[] = [
  { value: 'claude-cli', label: 'Claude' },
  { value: 'codex-cli', label: 'Codex' },
  { value: 'gemini-cli', label: 'Gemini' },
];

const ROLES: ReviewerRole[] = ['regression', 'architecture', 'security', 'test-gap', 'performance', 'custom'];
const ROLE_COLORS: Record<ReviewerRole, string> = {
  regression: '#2980b9',
  architecture: '#16a085',
  security: '#c0392b',
  'test-gap': '#9b59b6',
  performance: '#e67e22',
  custom: '#8c8278',
};

let nextId = 1;
function makeReviewer(role: ReviewerRole = 'security', model = 'sonnet'): ReviewerDraft {
  return { id: String(nextId++), provider: 'claude-cli', model, role, customTitle: '', customDesc: '', skillFile: '' };
}

function repoName(repoPath: string): string {
  const segments = repoPath.replace(/[\\/]+$/, '').split(/[\\/]/);
  return segments[segments.length - 1] || repoPath;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  meeting: 'Meeting',
  completed: 'Completed',
  failed: 'Failed',
};

export function SetupScreen({ onStart, onResumeSession, submitRef }: SetupScreenProps) {
  type ProviderCfg = { id: string; name: string; models: Array<{ id: string; label: string }> };
  const [providersCfg, setProvidersCfg] = useState<ProviderCfg[]>([]);
  const [pastSessions, setPastSessions] = useState<ReviewSession[]>([]);
  const [repoPath, setRepoPath] = useState('');
  const [repoError, setRepoError] = useState<string>();
  const [targetKind, setTargetKind] = useState<'working-tree' | 'git-range'>('working-tree');
  const [baseRef, setBaseRef] = useState('');
  const [headRef, setHeadRef] = useState('');
  const [refs, setRefs] = useState<string[]>([]);

  const [managerProvider, setManagerProvider] = useState<LLMProvider>('claude-cli');
  const [managerModel, setManagerModel] = useState('sonnet');
  const [customPrompt, setCustomPrompt] = useState('Review this repository for bugs, security issues, and code quality. Read the code and diff before reporting findings.');
  const [prFormat, setPrFormat] = useState(true);
  const [timeoutMin, setTimeoutMin] = useState(10);
  const [reviewers, setReviewers] = useState<ReviewerDraft[]>([
    makeReviewer('security'),
    makeReviewer('architecture'),
  ]);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.api.config.get().then((cfg) => setProvidersCfg(cfg.providers));
  }, []);

  const modelsForProvider = (pid: string) =>
    providersCfg.find((p) => p.id === pid)?.models ?? [];

  useEffect(() => {
    let stale = false;
    window.api.session.list().then((sessions) => {
      if (!stale) setPastSessions(sessions);
    });
    return () => { stale = true; };
  }, []);

  useEffect(() => {
    if (!repoPath) return;
    let stale = false;
    window.api.fs.getGitRefs(repoPath).then((r) => {
      if (!stale) setRefs(r);
    });
    return () => { stale = true; };
  }, [repoPath]);

  async function pickDirectory() {
    const picked = await window.api.fs.pickDirectory();
    if (picked) { setRepoPath(picked); setRepoError(undefined); }
  }

  function addReviewer() {
    const unusedRole = ROLES.find((r) => !reviewers.some((rv) => rv.role === r)) ?? 'security';
    setReviewers((prev) => [...prev, makeReviewer(unusedRole)]);
  }

  function removeReviewer(id: string) {
    setReviewers((prev) => prev.filter((r) => r.id !== id));
  }

  function updateReviewer(id: string, patch: Partial<ReviewerDraft>) {
    setReviewers((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const canStart =
    repoPath.trim().length > 0 &&
    managerModel.trim().length > 0 &&
    reviewers.length > 0 &&
    reviewers.every((r) => r.model.trim().length > 0) &&
    (targetKind !== 'git-range' || (baseRef.trim().length > 0 && headRef.trim().length > 0));

  useEffect(() => {
    if (submitRef) submitRef.current = () => { if (canStart && !busy) handleStart(); };
    return () => { if (submitRef) submitRef.current = null; };
  });

  async function handleStart() {
    setBusy(true);
    const result = await window.api.fs.validateRepo(repoPath);
    if (!result.valid) {
      setRepoError(result.error ?? 'Not a valid git repository');
      setBusy(false);
      return;
    }

    const reviewTarget: ReviewTarget =
      targetKind === 'git-range'
        ? { kind: 'git-range', baseRef, headRef }
        : { kind: 'working-tree' };

    const session = await window.api.session.create({
      repoPath,
      reviewTarget,
      reviewers: reviewers.map((r) => ({
        id: r.id,
        provider: r.provider,
        model: r.model,
        role: r.role,
        colorToken: ROLE_COLORS[r.role] ?? '#8c8278',
        ...(r.role === 'custom' && r.customTitle ? { customRoleTitle: r.customTitle } : {}),
        ...(r.role === 'custom' && r.customDesc ? { customRoleDesc: r.customDesc } : {}),
        ...(r.skillFile ? { skillFilePath: r.skillFile } : {}),
      })),
      manager: { provider: managerProvider, model: managerModel, synthesisStyle: 'balanced' },
      customPrompt: (customPrompt.trim() || '') + (prFormat ? '\n\nFormat the manager summary as a PR review: list issues, suggested fixes, and an overall verdict.' : ''),
      timeoutMinutes: timeoutMin,
    });

    await window.api.review.start(session.id);
    setBusy(false);
    onStart(session);
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <h1 className={styles.heading}>Configure Review</h1>
        <p className={styles.hint}>Uses your local AI CLIs (Claude, Codex, Gemini) — no API key needed.</p>
      </header>

      {pastSessions.length > 0 && (
        <section className={styles.section}>
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <h2 className={styles.sectionLabel}>Recent Sessions</h2>
            <button type="button" className={styles.removeBtn} onClick={async () => {
              await window.api.session.clearAll();
              setPastSessions([]);
            }}>Clear all</button>
          </div>
          <ul className={styles.sessionList}>
            {pastSessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={styles.sessionRow}
                  onClick={() => onResumeSession(s)}
                >
                  <span className={styles.sessionDate}>{formatDate(s.createdAt)}</span>
                  <span className={styles.sessionRepo}>{repoName(s.repoPath)}</span>
                  <span className={`${styles.sessionStatus} ${styles[`status_${s.status}`] ?? ''}`}>
                    {STATUS_LABELS[s.status] ?? s.status}
                  </span>
                  <span className={styles.sessionReviewers}>
                    {s.reviewers.length} reviewer{s.reviewers.length !== 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Repository</h2>
        <div className={styles.row}>
          <input
            className={`${styles.input} ${styles.flex1} ${repoError ? styles.inputError : ''}`}
            type="text"
            value={repoPath}
            onChange={(e) => { setRepoPath(e.target.value); setRepoError(undefined); }}
            placeholder="/path/to/repo"
            aria-label="Repository path"
          />
          <button type="button" className={styles.ghostBtn} onClick={pickDirectory}>Browse…</button>
        </div>
        {repoError && <p className={styles.error} role="alert">{repoError}</p>}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Review Target</h2>
        <div className={styles.row}>
          <label className={styles.radio}>
            <input type="radio" checked={targetKind === 'working-tree'} onChange={() => setTargetKind('working-tree')} />
            Working tree
          </label>
          <label className={styles.radio}>
            <input type="radio" checked={targetKind === 'git-range'} onChange={() => setTargetKind('git-range')} />
            Git ref range
          </label>
        </div>
        {targetKind === 'git-range' && (
          <div className={styles.row}>
            <select
              className={`${styles.select} ${styles.flex1}`}
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              aria-label="Base ref"
            >
              <option value="">— base ref —</option>
              {refs.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <span className={styles.arrow}>→</span>
            <select
              className={`${styles.select} ${styles.flex1}`}
              value={headRef}
              onChange={(e) => setHeadRef(e.target.value)}
              aria-label="Head ref"
            >
              <option value="">— head ref —</option>
              {refs.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Review Instructions</h2>
        <textarea
          className={`${styles.input} ${styles.full} ${styles.textarea}`}
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Tell the reviewers what to do, e.g. 'Review for bugs and security' or 'How much is 1+1?'"
          aria-label="Review instructions"
          rows={3}
        />
        <label className={styles.radio}>
          <input type="checkbox" checked={prFormat} onChange={(e) => setPrFormat(e.target.checked)} />
          Summarize as PR review format
        </label>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Manager</h2>
        <div className={styles.row}>
          <select className={styles.select} value={managerProvider} onChange={(e) => { setManagerProvider(e.target.value as LLMProvider); setManagerModel(modelsForProvider(e.target.value)[0]?.id ?? ''); }} aria-label="Manager provider">
            {providersCfg.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className={`${styles.select} ${styles.flex1}`} value={managerModel} onChange={(e) => setManagerModel(e.target.value)} aria-label="Manager model">
            {modelsForProvider(managerProvider).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            <option value="">— custom —</option>
          </select>
          {!modelsForProvider(managerProvider).some((m) => m.id === managerModel) && (
            <input className={`${styles.input} ${styles.flex1}`} value={managerModel} onChange={(e) => setManagerModel(e.target.value)} placeholder="Custom model ID" aria-label="Custom manager model" />
          )}
        </div>
        <div className={styles.row}>
          <span className={styles.sectionLabel} style={{ fontSize: '11px', minWidth: 0 }}>Timeout</span>
          <input
            className={styles.input}
            type="number"
            min={1}
            max={60}
            value={timeoutMin}
            onChange={(e) => setTimeoutMin(Math.max(1, Math.min(60, Number(e.target.value) || 10)))}
            style={{ width: 60 }}
            aria-label="Timeout in minutes"
          />
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>min per reviewer</span>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionLabel}>Reviewers</h2>
        <div className={styles.reviewerList}>
          {reviewers.map((r) => (
            <div key={r.id} className={styles.reviewerCard}>
              <div className={styles.reviewerRow}>
                <span className={styles.dot} style={{ background: ROLE_COLORS[r.role] ?? '#8c8278' }} />
                <select
                  className={styles.select}
                  value={r.provider}
                  onChange={(e) => {
                    const pid = e.target.value as LLMProvider;
                    const firstModel = modelsForProvider(pid)[0]?.id ?? 'default';
                    updateReviewer(r.id, { provider: pid, model: firstModel });
                  }}
                  aria-label="Provider"
                >
                  {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <select
                  className={styles.select}
                  value={r.role}
                  onChange={(e) => updateReviewer(r.id, { role: e.target.value as ReviewerRole })}
                  aria-label="Role"
                >
                  {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <select
                  className={`${styles.select} ${styles.flex1}`}
                  value={modelsForProvider(r.provider).some((m) => m.id === r.model) ? r.model : ''}
                  onChange={(e) => updateReviewer(r.id, { model: e.target.value })}
                  aria-label="Model"
                >
                  {modelsForProvider(r.provider).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  <option value="">custom</option>
                </select>
                {!modelsForProvider(r.provider).some((m) => m.id === r.model) && (
                  <input
                    className={`${styles.input} ${styles.flex1}`}
                    value={r.model}
                    onChange={(e) => updateReviewer(r.id, { model: e.target.value })}
                    placeholder="Custom model ID"
                    aria-label="Custom model"
                  />
                )}
                <button type="button" className={styles.removeBtn} onClick={() => removeReviewer(r.id)} aria-label="Remove reviewer">✕</button>
              </div>
              {r.role === 'custom' && (
                <div className={styles.customFields}>
                  <input
                    className={`${styles.input} ${styles.flex1}`}
                    value={r.customTitle}
                    onChange={(e) => updateReviewer(r.id, { customTitle: e.target.value })}
                    placeholder="Custom role title"
                    aria-label="Custom role title"
                  />
                  <input
                    className={`${styles.input} ${styles.flex1}`}
                    value={r.customDesc}
                    onChange={(e) => updateReviewer(r.id, { customDesc: e.target.value })}
                    placeholder="Description or paste skill instructions"
                    aria-label="Custom role description"
                  />
                  <input
                    className={`${styles.input} ${styles.flex1}`}
                    value={r.skillFile}
                    onChange={(e) => updateReviewer(r.id, { skillFile: e.target.value })}
                    placeholder="Path to .md skill file (optional)"
                    aria-label="Skill file path"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        {reviewers.length < 5 && (
          <button type="button" className={styles.ghostBtn} onClick={addReviewer}>+ Add reviewer</button>
        )}
      </section>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={handleStart}
          disabled={!canStart || busy}
          aria-busy={busy}
        >
          {busy ? 'Starting…' : 'Start Review'}
        </button>
      </div>
    </div>
  );
}
