import { useEffect, useState, useCallback, useMemo, useRef, startTransition } from 'react';
import type { ReviewSession, Finding, ReviewEvent } from '../../../../shared/types';
import { Badge } from '../../components/badge';
import { MeetingScene } from './meeting-scene';
import styles from './meeting-room.module.css';

type Props = {
  session: ReviewSession | null;
  onBack: () => void;
  onNewReview: () => void;
};

export function MeetingRoomScreen({ session, onBack, onNewReview }: Props) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [findingOwners, setFindingOwners] = useState<Map<string, string>>(new Map());
  const [sessionStatus, setSessionStatus] = useState(session?.status ?? 'queued');
  const [followUpPrompt, setFollowUpPrompt] = useState('');
  const [selectedReviewers, setSelectedReviewers] = useState<Set<string>>(new Set());
  const [followUpRunning, setFollowUpRunning] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [sceneOpen, setSceneOpen] = useState(true);
  const [prDesc, setPrDesc] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string; at: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!session) return;
    setSelectedReviewers(new Set(session.reviewers.map((r) => r.id)));
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let stale = false;
    let pollTimer: ReturnType<typeof setTimeout>;

    const pollStatus = async () => {
      try {
        const fresh = await window.api.session.get(session.id);
        if (stale) return;
        if (fresh) {
          setSessionStatus(fresh.status);
          if (fresh.status !== 'completed' && fresh.status !== 'failed') {
            pollTimer = setTimeout(pollStatus, 2000);
          }
        }
      } catch {
        if (!stale) pollTimer = setTimeout(pollStatus, 3000);
      }
    };
    pollStatus();

    window.api.findings.get(session.id).then((f) => { if (!stale) setFindings(f); });

    window.api.events.get(session.id).then((events: ReviewEvent[]) => {
      if (stale) return;
      const owners = new Map<string, string>();
      const reviewerMap = new Map(session.reviewers.map((r) => [r.id, r.role]));
      for (const e of events) {
        if ((e.type === 'finding.draft' || e.type === 'finding.final') && e.finding?.id) {
          owners.set(e.finding.id, reviewerMap.get(e.agentId) ?? e.agentId);
        }
      }
      setFindingOwners(owners);
    });

    const fetchSummary = async () => {
      const s = await window.api.session.getSummary(session.id);
      if (stale) return;
      if (s) {
        setSummary(s);
        window.api.review.generatePrDesc(session.id).then((pd) => { if (!stale) setPrDesc(pd); }).catch(() => {});
      } else {
        setTimeout(fetchSummary, 2000);
      }
    };
    fetchSummary();

    return () => { stale = true; clearTimeout(pollTimer); };
  }, [session]);

  const exportMarkdown = useCallback(() => {
    if (session) window.api.export.markdown(session.id);
  }, [session]);

  const exportJSON = useCallback(() => {
    if (session) window.api.export.json(session.id);
  }, [session]);

  useEffect(() => {
    if (!followUpRunning || !session) return;
    let stale = false;

    const poll = async () => {
      if (stale) return;
      const s = await window.api.session.get(session.id);
      if (stale) return;
      if (s && s.status === 'completed') {
        setFollowUpRunning(false);
        setSessionStatus('completed');
        const [updatedFindings, updatedSummary] = await Promise.all([
          window.api.findings.get(session.id),
          window.api.session.getSummary(session.id),
        ]);
        if (stale) return;
        setFindings(updatedFindings);
        if (updatedSummary) setSummary(updatedSummary);
        window.api.review.generatePrDesc(session.id).then((pd) => { if (!stale) setPrDesc(pd); }).catch(() => {});
      } else if (s && s.status === 'failed') {
        setFollowUpRunning(false);
        setSessionStatus('failed');
      } else {
        setTimeout(poll, 2000);
      }
    };
    poll();

    return () => { stale = true; };
  }, [followUpRunning, session]);

  const sendFollowUp = useCallback(async () => {
    if (!session || !followUpPrompt.trim() || selectedReviewers.size === 0) return;
    setFollowUpRunning(true);
    setSummary(null);
    await window.api.review.followUp(session.id, followUpPrompt.trim(), Array.from(selectedReviewers));
    setFollowUpPrompt('');
  }, [session, followUpPrompt, selectedReviewers]);

  useEffect(() => {
    if (!session) return;
    window.api.chat.getHistory(session.id).then(setChatMessages).catch(() => {});
  }, [session]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendChat = useCallback(async () => {
    if (!session || !chatInput.trim() || chatSending) return;
    const msg = chatInput.trim();
    setChatInput('');
    setChatSending(true);
    setChatMessages((prev) => [...prev, { role: 'user', content: msg, at: new Date().toISOString() }]);
    try {
      const response = await window.api.chat.send(session.id, msg);
      setChatMessages((prev) => [...prev, { role: 'assistant', content: response, at: new Date().toISOString() }]);
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}`, at: new Date().toISOString() }]);
    } finally {
      setChatSending(false);
    }
  }, [session, chatInput, chatSending]);

  const toggleReviewer = useCallback((id: string) => {
    setSelectedReviewers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const stats = useMemo(() => {
    const reviewerCounts = new Map<string, number>();
    for (const f of findings) {
      const owner = findingOwners.get(f.id) ?? 'Unknown';
      reviewerCounts.set(owner, (reviewerCounts.get(owner) ?? 0) + 1);
    }

    const uniqueCount = new Set(
      findings.map((f) => f.title.toLowerCase().trim()),
    ).size;

    const severityCounts: Record<string, number> = {};
    for (const f of findings) {
      severityCounts[f.severity] = (severityCounts[f.severity] ?? 0) + 1;
    }

    return { reviewerCounts, uniqueCount, severityCounts };
  }, [findings, findingOwners]);

  if (!session) {
    return <div className={styles.empty}><p>No session to review.</p></div>;
  }

  return (
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <h1 className={styles.heading}>Meeting Room</h1>
          <p className={styles.sub}>{findings.length} findings</p>
        </div>
        <div className={styles.headerActions}>
          {sessionStatus === 'completed' && (
            <button type="button" className={styles.followUpHeaderBtn} onClick={() => setFollowUpOpen(true)} disabled={followUpRunning}>
              {followUpRunning ? 'Running…' : '+ Follow Up'}
            </button>
          )}
          <button type="button" className={styles.ghostBtn} onClick={exportMarkdown} disabled={!summary}>Export Markdown</button>
          <button type="button" className={styles.ghostBtn} onClick={exportJSON} disabled={findings.length === 0}>Export JSON</button>
          <button type="button" className={styles.ghostBtn} onClick={onBack}>← Live Review</button>
          <button type="button" className={styles.ghostBtn} onClick={onNewReview}>New Review</button>
        </div>
      </header>

      {findings.length > 0 && (
        <div className={styles.statsBar}>
          <span>
            {Array.from(stats.reviewerCounts.entries())
              .map(([name, count]) => `${name}: ${count} finding${count !== 1 ? 's' : ''}`)
              .join(' · ')}
          </span>
          <span className={styles.statsDivider}>|</span>
          <span>{findings.length} total, {stats.uniqueCount} unique</span>
          <span className={styles.statsDivider}>|</span>
          <span>
            {(['critical', 'high', 'medium', 'low'] as const)
              .filter((s) => stats.severityCounts[s])
              .map((s) => `${stats.severityCounts[s]} ${s}`)
              .join(', ')}
          </span>
        </div>
      )}

      <div className={styles.body}>
        <div className={styles.sceneToggle}>
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => startTransition(() => setSceneOpen((o) => !o))}
          >
            {sceneOpen ? '▼ Hide Room' : '▶ Show Room'}
          </button>
        </div>
        {sceneOpen && (
          <MeetingScene
            reviewers={session.reviewers}
            manager={session.manager}
            summarySnippet={summary ? summary.slice(0, 60) : ''}
            loading={!summary}
            managerDrafting={chatSending}
          />
        )}

        <div className={styles.panels}>
          <section className={styles.findingsPanel}>
            <h2 className={styles.panelTitle}>Findings</h2>
            {findings.length === 0 ? (
              <p className={styles.muted}>No findings.</p>
            ) : (
              <ul className={styles.findingList}>
                {findings
                  .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
                  .map((f) => (
                    <li key={f.id} className={styles.findingCard}>
                      <div className={styles.findingHeader}>
                        <Badge
                          label={f.severity}
                          variant={f.severity === 'critical' || f.severity === 'high' ? 'danger' : f.severity === 'medium' ? 'warning' : 'neutral'}
                        />
                        <Badge label={f.confidence} variant="info" />
                        {findingOwners.get(f.id) && (
                          <Badge label={findingOwners.get(f.id)!} variant="neutral" />
                        )}
                      </div>
                      <h3 className={styles.findingTitle}>{f.title}</h3>
                      <p className={styles.findingSummary}>{f.summary}</p>
                      {f.evidence.map((e, i) => (
                        <code key={i} className={styles.evidence}>
                          {e.path}{e.line ? `:${e.line}` : ''}{e.excerpt ? ` — ${e.excerpt.slice(0, 80)}` : ''}
                        </code>
                      ))}
                      <p className={styles.recommendation}>{f.recommendation}</p>
                    </li>
                  ))}
              </ul>
            )}
          </section>

          <section className={styles.summaryPanel}>
            <h2 className={styles.panelTitle}>Manager Summary</h2>
            {summary ? (
              <div
                className={styles.summaryText}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }}
              />
            ) : (
              <p className={styles.muted}>Summary not yet available.</p>
            )}

            {prDesc && (
              <details className={styles.prDescDetails}>
                <summary className={styles.prDescToggle}>Recommended PR Description</summary>
                <div className={styles.prDescContainer}>
                  <div
                    className={styles.summaryText}
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(prDesc) }}
                  />
                  <button
                    type="button"
                    className={styles.copyBtn}
                    onClick={() => { navigator.clipboard.writeText(prDesc); }}
                  >
                    Copy to clipboard
                  </button>
                </div>
              </details>
            )}
          </section>
        </div>
      </div>

      {sessionStatus === 'completed' && summary && (
        <details className={styles.chatSection}>
          <summary className={styles.chatToggle}>Consult Manager</summary>
          <div className={styles.chatMessages}>
            {chatMessages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? styles.chatUserMsg : styles.chatAssistantMsg}>
                {m.content}
              </div>
            ))}
            {chatSending && <div className={styles.chatThinking}>Manager is thinking...</div>}
            <div ref={chatEndRef} />
          </div>
          <div className={styles.chatInput}>
            <input
              type="text"
              placeholder="Ask the manager about the review..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              disabled={chatSending}
            />
            <button type="button" onClick={sendChat} disabled={chatSending || !chatInput.trim()}>
              {chatSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </details>
      )}

      {followUpOpen && (
        <div className={styles.followUpOverlay} onClick={() => !followUpRunning && setFollowUpOpen(false)}>
          <div className={styles.followUpDialog} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.followUpTitle}>Follow Up Review</h2>
            <textarea
              className={styles.followUpTextarea}
              placeholder="e.g. I fixed all issues, please re-review..."
              value={followUpPrompt}
              onChange={(e) => setFollowUpPrompt(e.target.value)}
              disabled={followUpRunning}
              rows={4}
              autoFocus
            />
            <div className={styles.reviewerCheckboxes}>
              {session.reviewers.map((r) => (
                <label key={r.id} className={styles.reviewerCheckbox}>
                  <input
                    type="checkbox"
                    checked={selectedReviewers.has(r.id)}
                    onChange={() => toggleReviewer(r.id)}
                    disabled={followUpRunning}
                  />
                  {r.role} ({r.provider})
                </label>
              ))}
            </div>
            <div className={styles.followUpActions}>
              <button type="button" className={styles.ghostBtn} onClick={() => setFollowUpOpen(false)} disabled={followUpRunning}>Cancel</button>
              <button
                type="button"
                className={styles.followUpBtn}
                onClick={() => { sendFollowUp(); setFollowUpOpen(false); }}
                disabled={followUpRunning || !followUpPrompt.trim() || selectedReviewers.size === 0}
              >
                Send Follow Up
              </button>
            </div>
            {followUpRunning && <span className={styles.followUpStatus}>Processing follow-up...</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function severityRank(s: string): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s] ?? 4;
}

function renderMarkdown(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/^(?!<[hulo])(.+)$/gm, '$1<br/>')
    .replace(/^/, '<p>').replace(/$/, '</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<[hulo])/g, '$1')
    .replace(/(<\/[hulo][^>]*>)<\/p>/g, '$1');
}
