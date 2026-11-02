import { useState, useEffect, useMemo } from 'react';
import type { Worklog, DraftWorklog, IssueDisplayMode } from './types';
import {
  getWeekStart,
  getWeekDays,
  getPreviousWeek,
  getNextWeek,
  formatDate
} from './utils/dateUtils';
import { fetchMockWorklogs } from './utils/mockData';
import { loadDrafts, saveDrafts, clearDrafts } from './utils/storageUtils';
import { loadTicketList, saveTicketList } from './utils/ticketListStorage';
import type { TicketEntry } from './utils/ticketListStorage';
import { mergeWorklogsAndDrafts } from './utils/validationUtils';
import { fetchWorklogsForWeek, isJiraConfigured, fetchJiraConfig, createJiraWorklog, updateJiraWorklog, deleteJiraWorklog, invalidateWeekCache, fetchActiveIssues, fetchIssueSummary, clearCache } from './services/jiraService';
import type { CacheScope } from './services/jiraService';
import { fetchCalendarSources, isCalendarImportConfigured } from './services/calendarService';
import { getIssueLabel } from './utils/issueDisplayUtils';
import { WeekNavigation } from './components/WeekNavigation';
import { StatusMatrix } from './components/StatusMatrix';
import { InteractiveTimeline } from './components/InteractiveTimeline';
import { ReviewPanel } from './components/ReviewPanel';
import { LoadingOverlay } from './components/LoadingOverlay';
import { ClearCacheModal } from './components/ClearCacheModal';
import { CalendarImportWizard } from './components/CalendarImport/CalendarImportWizard';
import './App.css';

function App() {
  const [jiraBaseUrl, setJiraBaseUrl] = useState<string | null>(null);
  const [jiraConfigLoaded, setJiraConfigLoaded] = useState(false);
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [jiraWorklogs, setJiraWorklogs] = useState<Worklog[]>([]);
  const [drafts, setDrafts] = useState<DraftWorklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);
  const [selectedWorklogIds, setSelectedWorklogIds] = useState<Set<string>>(new Set());
  const [clipboardWorklogs, setClipboardWorklogs] = useState<Worklog[]>([]);
  const [issueNameMap, setIssueNameMap] = useState<Record<string, string>>({});
  const [issueDisplayMode, setIssueDisplayMode] = useState<IssueDisplayMode>('name');
  const [activeIssueMap, setActiveIssueMap] = useState<Record<string, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [ticketList, setTicketList] = useState<TicketEntry[]>([]);
  const [clearCacheModalOpen, setClearCacheModalOpen] = useState(false);
  const [calendarImportAvailable, setCalendarImportAvailable] = useState(false);
  const [calendarImportOpen, setCalendarImportOpen] = useState(false);

  const weekStart = useMemo(() => getWeekStart(currentWeek), [currentWeek]);
  const weekDays = useMemo(() => getWeekDays(currentWeek), [currentWeek]);

  // Calculate week end for API queries
  const weekEnd = useMemo(() => {
    const end = new Date(weekDays[weekDays.length - 1]);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekDays]);
  const allWorklogs = mergeWorklogsAndDrafts(jiraWorklogs, drafts);

  // Merge week worklogs + active issues into a unified sorted list for the dropdown
  const aliasOverrides = useMemo(
    () => Object.fromEntries(ticketList.filter(e => e.alias).map(e => [e.key, e.alias!])),
    [ticketList]
  );
  const mergedIssueNameMap = { ...activeIssueMap, ...issueNameMap, ...aliasOverrides };
  const colorOverrideMap = useMemo(
    () => Object.fromEntries(ticketList.filter(e => e.color).map(e => [e.key, e.color!])),
    [ticketList]
  );

  const formatIssueLabel = (issueKey: string, maxLength?: number) => {
    return getIssueLabel(issueKey, mergedIssueNameMap, issueDisplayMode, maxLength);
  };

  const getIssueFullLabel = (issueKey: string) => {
    return mergedIssueNameMap[issueKey] || issueKey;
  };

  const isIssueAliased = (issueKey: string) => {
    return Boolean(aliasOverrides[issueKey]) && issueDisplayMode === 'name';
  };

  const getIssueUrl = (issueKey: string) => {
    if (!jiraBaseUrl) {
      return null;
    }

    const trimmedBaseUrl = jiraBaseUrl.replace(/\/+$/, '');
    const browseBaseUrl = trimmedBaseUrl.endsWith('/browse')
      ? trimmedBaseUrl
      : `${trimmedBaseUrl}/browse`;

    return `${browseBaseUrl}/${encodeURIComponent(issueKey)}`;
  };

  // Fetch Jira config from the local middleware once on mount
  useEffect(() => {
    fetchJiraConfig().then(config => {
      setJiraBaseUrl(config.baseUrl);
      setJiraConfigLoaded(true);
    });
  }, []);

  // Fetch calendar-import config once on mount; the button only appears
  // once at least one ICS_CALENDAR_* calendar is configured.
  useEffect(() => {
    fetchCalendarSources().then(() => {
      setCalendarImportAvailable(isCalendarImportConfigured());
    });
  }, []);

  // Load the ticket list from its server-side cache file once on mount
  // (and again after a "ticket-list" cache clear via refreshKey)
  useEffect(() => {
    loadTicketList().then(setTicketList);
  }, [refreshKey]);

  // Load worklogs and drafts when week changes (waits for config to be ready)
  useEffect(() => {
    if (!jiraConfigLoaded) return;
    const loadWeekData = async () => {
      setLoading(true);
      setError(null);
      setUsingMockData(false);

      try {
        let worklogs: Worklog[];
        let names: Record<string, string> = {};

        // Try to fetch from Jira if configured, otherwise use mock data
        if (isJiraConfigured()) {
          try {
            const jiraData = await fetchWorklogsForWeek(weekStart, weekEnd);
            worklogs = jiraData.worklogs;
            names = jiraData.issueNameMap;
          } catch (jiraError) {
            console.warn('[APP] Jira fetch failed, falling back to mock data', jiraError);
            worklogs = await fetchMockWorklogs(weekStart);
            setUsingMockData(true);
          }
        } else {
          console.log('[APP] Jira not configured, using mock data');
          worklogs = await fetchMockWorklogs(weekStart);
          setUsingMockData(true);
        }

        setJiraWorklogs(worklogs);
        setIssueNameMap(names);

        // Load drafts from LocalStorage
        const savedDrafts = loadDrafts(weekStart);
        setDrafts(savedDrafts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    loadWeekData();
    // Use formatDate to create stable dependency
  }, [jiraConfigLoaded, formatDate(weekStart), formatDate(weekEnd), refreshKey]);

  // Load active issues once (cached server-side; re-fetched when refreshKey changes)
  useEffect(() => {
    if (!jiraConfigLoaded || !isJiraConfigured()) return;
    fetchActiveIssues().then(issues => {
      const map: Record<string, string> = {};
      for (const issue of issues) {
        map[issue.key] = issue.summary;
      }
      setActiveIssueMap(map);
    });
  }, [jiraConfigLoaded, refreshKey]);

  // Save drafts to LocalStorage whenever they change
  useEffect(() => {
    if (!loading) {
      saveDrafts(weekStart, drafts);
    }
    // Use formatDate to create stable dependency
  }, [drafts, formatDate(weekStart), loading]);

  // Keyboard event listener for Delete/Backspace and Ctrl+C
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Ctrl+C / Cmd+C: copy selected worklogs to clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selectedWorklogIds.size > 0 && !isInputField) {
        e.preventDefault();
        const merged = mergeWorklogsAndDrafts(jiraWorklogs, drafts);
        const copied = merged.filter(w => selectedWorklogIds.has(w.id));
        if (copied.length > 0) {
          setClipboardWorklogs(copied);
        }
        return;
      }

      // Delete/Backspace: delete selected worklogs
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWorklogIds.size > 0) {
        if (isInputField) return;

        e.preventDefault();

        // Delete all selected worklogs
        selectedWorklogIds.forEach(id => {
          setDrafts(prev => {
            // If it's a draft creation, just remove it
            const draftIndex = prev.findIndex(d => d.id === id && d.changeType === 'create');
            if (draftIndex !== -1) {
              return prev.filter(d => d.id !== id);
            }

            // If it's a Jira worklog, create a delete draft
            const originalWorklog = jiraWorklogs.find(w => w.id === id);
            if (!originalWorklog) return prev;

            const deleteDraft: DraftWorklog = {
              ...originalWorklog,
              source: 'draft',
              changeType: 'delete',
              lastModified: new Date().toISOString(),
            };

            return [...prev, deleteDraft];
          });
        });

        // Clear selection
        setSelectedWorklogIds(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWorklogIds, jiraWorklogs, drafts]);

  const handlePreviousWeek = () => {
    setCurrentWeek(prev => getPreviousWeek(prev));
  };

  const handleNextWeek = () => {
    setCurrentWeek(prev => getNextWeek(prev));
  };

  const handleToday = () => {
    setCurrentWeek(new Date());
  };

  const handleTicketListChange = (newList: TicketEntry[]) => {
    setTicketList(newList);
    saveTicketList(newList);
  };

  const handleClearCache = async (scopes: CacheScope[]) => {
    await clearCache(scopes);
    setRefreshKey(k => k + 1);
  };

  const handleCreateWorklog = (draft: DraftWorklog) => {
    setDrafts(prev => [...prev, draft]);
  };

  const handleImportWorklogs = (imported: DraftWorklog[]) => {
    setDrafts(prev => [...prev, ...imported]);
  };

  const handleUpdateWorklog = (id: string, updates: Partial<Worklog>) => {
    setDrafts(prev => {
      const existing = prev.find(d => d.id === id);

      if (existing) {
        // Update existing draft - preserve draft fields
        const updated: DraftWorklog = {
          ...existing,
          ...updates,
          source: 'draft' as const,
          changeType: existing.changeType,
          lastModified: new Date().toISOString()
        };
        return prev.map(d => d.id === id ? updated : d);
      } else {
        // Create new draft for updating a Jira worklog
        const originalWorklog = jiraWorklogs.find(w => w.id === id);
        if (!originalWorklog) return prev;

        const updateDraft: DraftWorklog = {
          id: originalWorklog.id,
          issueKey: originalWorklog.issueKey,
          start: originalWorklog.start,
          end: originalWorklog.end,
          durationMinutes: originalWorklog.durationMinutes,
          ...updates,
          source: 'draft' as const,
          changeType: 'update' as const,
          lastModified: new Date().toISOString(),
        };

        return [...prev, updateDraft];
      }
    });
  };

  const handleDeleteWorklog = (id: string) => {
    setDrafts(prev => {
      // If it's a draft creation, just remove it
      const draftIndex = prev.findIndex(d => d.id === id && d.changeType === 'create');
      if (draftIndex !== -1) {
        return prev.filter(d => d.id !== id);
      }

      // If it's a Jira worklog, create (or replace an existing) delete draft
      const originalWorklog = jiraWorklogs.find(w => w.id === id);
      if (!originalWorklog) return prev;

      const deleteDraft: DraftWorklog = {
        ...originalWorklog,
        source: 'draft',
        changeType: 'delete',
        lastModified: new Date().toISOString(),
      };

      const existingIndex = prev.findIndex(d => d.id === id);
      if (existingIndex !== -1) {
        return prev.map(d => d.id === id ? deleteDraft : d);
      }

      return [...prev, deleteDraft];
    });
  };

  const handleDuplicateWorklog = (id: string) => {
    // Find the worklog to duplicate (could be from jira or drafts)
    const worklogToDuplicate = allWorklogs.find(w => w.id === id);
    if (!worklogToDuplicate) return;

    // Create a new draft with the same properties but new ID
    const duplicateDraft: DraftWorklog = {
      ...worklogToDuplicate,
      id: crypto.randomUUID(),
      source: 'draft',
      changeType: 'create',
      lastModified: new Date().toISOString(),
    };

    setDrafts(prev => [...prev, duplicateDraft]);
  };

  const handleToggleSelection = (id: string, isMulti: boolean) => {
    setSelectedWorklogIds(prev => {
      const newSet = new Set(prev);
      if (isMulti) {
        // Multi-select: toggle the clicked worklog
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
      } else {
        // Single select: only select this worklog
        if (newSet.has(id) && newSet.size === 1) {
          // If clicking the only selected item, deselect it
          newSet.clear();
        } else {
          newSet.clear();
          newSet.add(id);
        }
      }
      return newSet;
    });
  };

  const handlePasteWorklogs = (dayIndex: number, cursorTime: Date) => {
    if (clipboardWorklogs.length === 0) return;

    // Anchor on the clipboard worklog with the earliest start time
    const anchor = clipboardWorklogs.reduce((earliest, w) =>
      w.start < earliest.start ? w : earliest
    );

    const anchorDate = new Date(anchor.start);
    const anchorMinutes = anchorDate.getHours() * 60 + anchorDate.getMinutes();
    const cursorMinutes = cursorTime.getHours() * 60 + cursorTime.getMinutes();

    const newDrafts: DraftWorklog[] = clipboardWorklogs.map(w => {
      const wDate = new Date(w.start);
      const wMinutes = wDate.getHours() * 60 + wDate.getMinutes();
      const relativeOffset = wMinutes - anchorMinutes;

      // Clamp so the block fits within the day
      const newStartMinutes = Math.max(0, Math.min(1439 - w.durationMinutes, cursorMinutes + relativeOffset));

      const targetDay = weekDays[dayIndex];
      const newStart = new Date(targetDay);
      newStart.setHours(Math.floor(newStartMinutes / 60), newStartMinutes % 60, 0, 0);

      const newEnd = new Date(newStart);
      newEnd.setMinutes(newEnd.getMinutes() + w.durationMinutes);

      return {
        ...w,
        id: crypto.randomUUID(),
        start: newStart.toISOString(),
        end: newEnd.toISOString(),
        source: 'draft' as const,
        changeType: 'create' as const,
        lastModified: new Date().toISOString(),
      };
    });

    setDrafts(prev => [...prev, ...newDrafts]);
  };

  const handleApproveAll = async () => {
    if (!isJiraConfigured()) {
      // Mock mode: optimistic local update only
      setDrafts([]);
      clearDrafts(weekStart);
      const mergedWorklogs = mergeWorklogsAndDrafts(jiraWorklogs, drafts);
      setJiraWorklogs(mergedWorklogs);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setReviewPanelOpen(false);
      return;
    }

    // Real Jira API: push each draft sequentially
    setLoading(true);
    const failed: DraftWorklog[] = [];
    const newJiraWorklogs = [...jiraWorklogs];

    for (const draft of drafts) {
      try {
        if (draft.changeType === 'create') {
          const created = await createJiraWorklog(draft);
          newJiraWorklogs.push({
            id: created.id,
            issueKey: draft.issueKey,
            start: draft.start,
            end: draft.end,
            durationMinutes: draft.durationMinutes,
            source: 'jira',
          });
        } else if (draft.changeType === 'update') {
          await updateJiraWorklog(draft);
          const idx = newJiraWorklogs.findIndex(w => w.id === draft.id);
          if (idx !== -1) {
            newJiraWorklogs[idx] = {
              id: draft.id,
              issueKey: draft.issueKey,
              start: draft.start,
              end: draft.end,
              durationMinutes: draft.durationMinutes,
              source: 'jira',
            };
          }
        } else if (draft.changeType === 'delete') {
          await deleteJiraWorklog(draft);
          const idx = newJiraWorklogs.findIndex(w => w.id === draft.id);
          if (idx !== -1) newJiraWorklogs.splice(idx, 1);
        }
      } catch (err) {
        console.error('[APP] Failed to sync draft', draft.id, err);
        failed.push(draft);
      }
    }

    // Invalidate the local cache so the next week navigation re-fetches from Jira
    await invalidateWeekCache(weekStart);

    setJiraWorklogs(newJiraWorklogs);
    setDrafts(failed);

    if (failed.length > 0) {
      saveDrafts(weekStart, failed);
      setApprovalError(`${failed.length} change(s) failed to sync to Jira — see review panel`);
      setTimeout(() => setApprovalError(null), 6000);
    } else {
      clearDrafts(weekStart);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setReviewPanelOpen(false);
    }

    setLoading(false);
  };

  const handleDiscardAll = () => {
    setDrafts([]);
    clearDrafts(weekStart);
    setReviewPanelOpen(false);
  };

  return (
    <div className="app">
      <WeekNavigation
        currentWeek={currentWeek}
        onPreviousWeek={handlePreviousWeek}
        onNextWeek={handleNextWeek}
        onToday={handleToday}
        issueDisplayMode={issueDisplayMode}
        onIssueDisplayModeChange={setIssueDisplayMode}
        onOpenClearCache={isJiraConfigured() ? () => setClearCacheModalOpen(true) : undefined}
        onOpenCalendarImport={calendarImportAvailable ? () => setCalendarImportOpen(true) : undefined}
      />

      {usingMockData && (
        <div style={{
          backgroundColor: '#fff3cd',
          color: '#856404',
          padding: '0.5rem 1rem',
          textAlign: 'center',
          borderBottom: '1px solid #ffeaa7',
          fontSize: '0.9rem',
        }}>
          ⚠️ Using mock data - Jira not configured. See .env.example for setup instructions.
        </div>
      )}

      <div className="app-content">
        <StatusMatrix
          weekDays={weekDays}
          worklogs={allWorklogs}
          loading={loading}
          error={error}
          formatIssueLabel={formatIssueLabel}
          getIssueFullLabel={getIssueFullLabel}
          isIssueAliased={isIssueAliased}
          getIssueUrl={getIssueUrl}
        />

        {!loading && !error && (
          <InteractiveTimeline
            weekDays={weekDays}
            worklogs={allWorklogs}
            onCreateWorklog={handleCreateWorklog}
            onUpdateWorklog={handleUpdateWorklog}
            onDeleteWorklog={handleDeleteWorklog}
            onDuplicateWorklog={handleDuplicateWorklog}
            formatIssueLabel={formatIssueLabel}
            getIssueFullLabel={getIssueFullLabel}
            isIssueAliased={isIssueAliased}
            startHour={6}
            endHour={20}
            selectedWorklogIds={selectedWorklogIds}
            onToggleSelection={handleToggleSelection}
            clipboardWorklogs={clipboardWorklogs}
            onPasteWorklogs={handlePasteWorklogs}
            ticketList={ticketList}
            onTicketListChange={handleTicketListChange}
            colorOverrideMap={colorOverrideMap}
            fetchIssueSummary={fetchIssueSummary}
            jiraConfigured={isJiraConfigured()}
            activeIssues={activeIssueMap}
          />
        )}
      </div>

      <ReviewPanel
        drafts={drafts}
        isOpen={reviewPanelOpen}
        onToggle={() => setReviewPanelOpen(!reviewPanelOpen)}
        onApproveAll={handleApproveAll}
        onDiscardAll={handleDiscardAll}
        formatIssueLabel={formatIssueLabel}
        getIssueFullLabel={getIssueFullLabel}
        isIssueAliased={isIssueAliased}
      />

      {showSuccess && (
        <div className="success-toast">
          ✓ Changes approved successfully!
        </div>
      )}

      {approvalError && (
        <div className="success-toast" style={{ backgroundColor: '#c0392b' }}>
          ✗ {approvalError}
        </div>
      )}
      {loading && <LoadingOverlay />}

      {clearCacheModalOpen && (
        <ClearCacheModal
          onClose={() => setClearCacheModalOpen(false)}
          onClear={handleClearCache}
        />
      )}

      {calendarImportOpen && (
        <CalendarImportWizard
          weekStart={weekStart}
          weekDays={weekDays}
          jiraWorklogs={jiraWorklogs}
          ticketList={ticketList}
          onClose={() => setCalendarImportOpen(false)}
          onImport={handleImportWorklogs}
        />
      )}
    </div>
  );
}

export default App;

