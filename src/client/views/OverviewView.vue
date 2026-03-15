<template>
  <div class="overview-view">
    <div class="page-heading">
      <h1 class="page-title">Project Overview</h1>
      <p class="page-subtitle">{{ store.project?.name }}</p>
    </div>

    <!-- Summary Cards -->
    <div class="section">
      <div class="cards-grid">
        <div class="card">
          <div class="card-value">{{ store.epics.length }}</div>
          <div class="card-label">Epics</div>
        </div>
        <div class="card">
          <div class="card-value">{{ allStories.length }}</div>
          <div class="card-label">Stories</div>
        </div>
        <div class="card">
          <div class="card-value">{{ acDone }} / {{ acTotal }}</div>
          <div class="card-label">ACs Done</div>
        </div>
        <div class="card">
          <div class="card-value">{{ taskDone }} / {{ taskTotal }}</div>
          <div class="card-label">Tasks Done</div>
        </div>
      </div>
    </div>

    <!-- Story Status -->
    <div class="section">
      <div class="section-title">Story Status</div>
      <div class="status-rows">
        <div
          v-for="s in STATUSES"
          :key="s.key"
          class="status-row"
        >
          <div class="status-left">
            <span class="status-dot" :style="{ background: `var(${s.colorVar})` }"></span>
            <span class="status-label" :style="{ color: `var(${s.colorVar})` }">{{ s.label }}</span>
          </div>
          <span class="status-count">{{ statusCounts[s.key] }}</span>
        </div>
      </div>
      <!-- Stacked progress bar -->
      <div class="status-bar-container" v-if="allStories.length > 0">
        <div class="status-bar">
          <div
            v-for="s in STATUSES"
            :key="s.key"
            class="status-bar-segment"
            :style="{
              flex: statusCounts[s.key],
              background: `var(${s.colorVar})`
            }"
            :title="`${s.label}: ${statusCounts[s.key]}`"
          ></div>
        </div>
      </div>
    </div>

    <!-- Per-Epic Breakdown -->
    <div class="section">
      <div class="section-title">Epics</div>
      <div class="epic-rows">
        <div
          v-for="row in epicRows"
          :key="row.id"
          class="epic-row"
        >
          <span class="epic-id-badge">{{ row.id }}</span>
          <span class="epic-title">{{ row.title }}</span>
          <span class="epic-story-count">{{ row.total }} stories</span>
          <span class="epic-pct-text">{{ row.pct }}%</span>
          <div class="epic-bar-track">
            <div
              class="epic-bar-fill"
              :style="{ width: `${row.pct}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Commit Coverage -->
    <div class="section">
      <div class="section-title">Commit Coverage</div>
      <p class="coverage-text">
        {{ storiesWithCommits }} of {{ allStories.length }} stories have mapped commits
        <span class="coverage-pct">({{ commitCoveragePct }}%)</span>
      </p>
      <div class="coverage-bar-track" v-if="allStories.length > 0">
        <div
          class="coverage-bar-fill"
          :style="{ width: `${commitCoveragePct}%` }"
        ></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useProjectStore } from '../stores/project'
import type { Task } from '../../types/index'

const store = useProjectStore()

const STATUSES = [
  { key: 'todo',   label: 'To Do',      colorVar: '--todo',   bgVar: '--todo-bg'   },
  { key: 'active', label: 'In Progress', colorVar: '--active', bgVar: '--active-bg' },
  { key: 'review', label: 'Review',      colorVar: '--review', bgVar: '--review-bg' },
  { key: 'done',   label: 'Done',        colorVar: '--done',   bgVar: '--done-bg'   },
] as const

// ─── Story aggregates ───
const allStories = computed(() => store.epics.flatMap(e => e.stories))

const statusCounts = computed(() => {
  const counts: Record<string, number> = { todo: 0, active: 0, review: 0, done: 0 }
  for (const s of allStories.value) {
    const k = (s.status ?? 'todo') as keyof typeof counts
    if (k in counts) counts[k]++
  }
  return counts
})

// ─── AC + Task totals ───
const acTotal = computed(() =>
  allStories.value.reduce((n, s) => n + s.acceptanceCriteria.length, 0)
)
const acDone = computed(() =>
  allStories.value.reduce((n, s) => n + s.acceptanceCriteria.filter(a => a.done).length, 0)
)

function flatTasks(story: typeof allStories.value[0]): Task[] {
  return story.tasks.flatMap((t: Task) => [t, ...(t.subtasks ?? [])])
}
const taskTotal = computed(() =>
  allStories.value.reduce((n, s) => n + flatTasks(s).length, 0)
)
const taskDone = computed(() =>
  allStories.value.reduce((n, s) => n + flatTasks(s).filter(t => t.done).length, 0)
)

// ─── Commit coverage ───
const mappedStoryIds = computed(() =>
  new Set(store.commitMappings.filter(c => c.storyId).map(c => c.storyId))
)
const storiesWithCommits = computed(() =>
  allStories.value.filter(s => mappedStoryIds.value.has(s.id)).length
)
const commitCoveragePct = computed(() =>
  allStories.value.length
    ? Math.round((storiesWithCommits.value / allStories.value.length) * 100)
    : 0
)

// ─── Per-epic rows ───
const epicRows = computed(() =>
  store.epics.map(e => ({
    id: e.id,
    title: e.title,
    total: e.stories.length,
    done: e.stories.filter(s => s.status === 'done').length,
    pct: e.stories.length
      ? Math.round(e.stories.filter(s => s.status === 'done').length / e.stories.length * 100)
      : 0,
  }))
)
</script>

<style scoped>
.overview-view {
  padding: 24px;
}

.page-heading {
  margin-bottom: 4px;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-0);
  margin: 0 0 4px 0;
}

.page-subtitle {
  font-size: 0.875rem;
  color: var(--text-2);
  margin: 0;
}

.section {
  margin-top: 28px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-2);
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
}

/* ─── Summary Cards ─── */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px;
}

.card-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-0);
  line-height: 1.2;
}

.card-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
  margin-top: 4px;
}

/* ─── Status Rows ─── */
.status-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-label {
  font-size: 0.85rem;
  font-weight: 500;
}

.status-count {
  font-size: 0.85rem;
  color: var(--text-1);
  font-weight: 600;
}

.status-bar-container {
  background: var(--bg-3);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.status-bar {
  display: flex;
  height: 6px;
}

.status-bar-segment {
  min-width: 2px;
  transition: flex 0.2s;
}

/* ─── Epic Rows ─── */
.epic-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.epic-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.epic-id-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-2);
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 2px 6px;
  flex-shrink: 0;
}

.epic-title {
  font-size: 0.875rem;
  color: var(--text-1);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.epic-story-count {
  font-size: 0.75rem;
  color: var(--text-2);
  flex-shrink: 0;
}

.epic-pct-text {
  font-size: 0.75rem;
  color: var(--text-1);
  font-weight: 600;
  flex-shrink: 0;
  width: 36px;
  text-align: right;
}

.epic-bar-track {
  width: 100px;
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  flex-shrink: 0;
  overflow: hidden;
}

.epic-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s;
}

/* ─── Commit Coverage ─── */
.coverage-text {
  font-size: 0.875rem;
  color: var(--text-1);
  margin: 0 0 10px 0;
}

.coverage-pct {
  color: var(--text-2);
}

.coverage-bar-track {
  width: 100%;
  height: 6px;
  background: var(--bg-3);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.coverage-bar-fill {
  height: 100%;
  background: var(--accent);
  border-radius: var(--radius-sm);
  transition: width 0.2s;
}
</style>
