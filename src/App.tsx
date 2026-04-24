import { useState, useEffect, useMemo } from 'react';
import type { Worklog, DraftWorklog } from './types';
import {
  getWeekStart,
  getWeekDays,
  getPreviousWeek,
  getNextWeek,
  formatDate
} from './utils/dateUtils';
import { fetchMockWorklogs } from './utils/mockData';
import { loadDrafts, saveDrafts, clearDrafts } from './utils/storageUtils';
import { mergeWorklogsAndDrafts } from './utils/validationUtils';
import { fetchWorklogsForWeek, isJiraConfigured } from './services/jiraService';
import { WeekNavigation } from './components/WeekNavigation';
import { StatusMatrix } from './components/StatusMatrix';
import { InteractiveTimeline } from './components/InteractiveTimeline';
import { ReviewPanel } from './components/ReviewPanel';
import './App.css';

function App() {
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [jiraWorklogs, setJiraWorklogs] = useState<Worklog[]>([]);
  const [drafts, setDrafts] = useState<DraftWorklog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewPanelOpen, setReviewPanelOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [usingMockData, setUsingMockData] = useState(false);
  const [selectedWorklogIds, setSelectedWorklogIds] = useState<Set<string>>(new Set());

  const weekStart = useMemo(() => getWeekStart(currentWeek), [currentWeek]);
  const weekDays = useMemo(() => getWeekDays(currentWeek), [currentWeek]);

  // Calculate week end for API queries
  const weekEnd = useMemo(() => {
    const end = new Date(weekDays[weekDays.length - 1]);
    end.setHours(23, 59, 59, 999);
    return end;
  }, [weekDays]);
  const allWorklogs = mergeWorklogsAndDrafts(jiraWorklogs, drafts);

  // Get unique issue keys for the dropdown
  const availableIssues = Array.from(
    new Set(allWorklogs.map(w => w.issueKey))
  ).sort();

  // Load worklogs and drafts when week changes
  useEffect(() => {
    const loadWeekData = async () => {
      setLoading(true);
      setError(null);
      setUsingMockData(false);

      try {
        let worklogs: Worklog[];

        // Try to fetch from Jira if configured, otherwise use mock data
        if (isJiraConfigured()) {
          try {
            worklogs = await fetchWorklogsForWeek(weekStart, weekEnd);
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
  }, [formatDate(weekStart), formatDate(weekEnd)]);

  // Save drafts to LocalStorage whenever they change
  useEffect(() => {
    if (!loading) {
      saveDrafts(weekStart, drafts);
    }
    // Use formatDate to create stable dependency
  }, [drafts, formatDate(weekStart), loading]);

  // Keyboard event listener for Delete/Backspace to delete selected worklogs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only delete if Delete or Backspace is pressed and there are selected worklogs
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWorklogIds.size > 0) {
        // Don't delete if user is typing in an input/textarea
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return;
        }

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
  }, [selectedWorklogIds, jiraWorklogs]);

  const handlePreviousWeek = () => {
    setCurrentWeek(prev => getPreviousWeek(prev));
  };

  const handleNextWeek = () => {
    setCurrentWeek(prev => getNextWeek(prev));
  };

  const handleToday = () => {
    setCurrentWeek(new Date());
  };

  const handleCreateWorklog = (draft: DraftWorklog) => {
    setDrafts(prev => [...prev, draft]);
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

  const handleDeleteSelected = () => {
    // Delete all selected worklogs
    selectedWorklogIds.forEach(id => {
      handleDeleteWorklog(id);
    });
    // Clear selection
    setSelectedWorklogIds(new Set());
  };

  const handleApproveAll = () => {
    // In MVP, this simulates pushing to Jira
    // In production, this would make API calls

    // Clear all drafts
    setDrafts([]);
    clearDrafts(weekStart);

    // Merge drafts into Jira worklogs (simulate sync)
    const mergedWorklogs = mergeWorklogsAndDrafts(jiraWorklogs, drafts);
    setJiraWorklogs(mergedWorklogs);

    // Show success message
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);

    setReviewPanelOpen(false);
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
        />

        {!loading && !error && (
          <InteractiveTimeline
            weekDays={weekDays}
            worklogs={allWorklogs}
            onCreateWorklog={handleCreateWorklog}
            onUpdateWorklog={handleUpdateWorklog}
            onDeleteWorklog={handleDeleteWorklog}
            onDuplicateWorklog={handleDuplicateWorklog}
            availableIssues={availableIssues.length > 0 ? availableIssues : ['PROJ-101']}
            startHour={6}
            endHour={20}
            selectedWorklogIds={selectedWorklogIds}
            onToggleSelection={handleToggleSelection}
          />
        )}
      </div>

      <ReviewPanel
        drafts={drafts}
        isOpen={reviewPanelOpen}
        onToggle={() => setReviewPanelOpen(!reviewPanelOpen)}
        onApproveAll={handleApproveAll}
        onDiscardAll={handleDiscardAll}
      />

      {showSuccess && (
        <div className="success-toast">
          ✓ Changes approved successfully!
        </div>
      )}
    </div>
  );
}

export default App;

