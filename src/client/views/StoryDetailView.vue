<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import type { CommitMapping } from '../../types/index'
import { renderMarkdown } from '../utils/markdown'

// ─── Route + Store ───
const route = useRoute()
const router = useRouter()
const store = useProjectStore()

// ─── Status Constants ───
const STATUSES = [
  { key: 'todo',   label: 'To Do',      colorVar: '--todo',   bgVar: '--todo-bg'   },
  { key: 'active', label: 'In Progress', colorVar: '--active', bgVar: '--active-bg' },
  { key: 'review', label: 'Review',      colorVar: '--review', bgVar: '--review-bg' },
  { key: 'done',   label: 'Done',        colorVar: '--done',   bgVar: '--done-bg'   },
] as const

// ─── Derive epic and story from route params ───
const epicId = computed(() => route.params.epicId as string)
const storyId = computed(() => route.params.storyId as string)

const epic = computed(() =>
  store.epics.find(e => e.id === epicId.value) ?? null
)
const story = computed(() =>
  epic.value?.stories.find(s => s.id === storyId.value) ?? null
)

// ─── Per-item pending state (prevents double-click race) ───
const pendingAC = ref<Set<number>>(new Set())
const pendingTask = ref<Set<string>>(new Set())
const pendingStatus = ref(false)

// ─── Back navigation ───
function goBack() {
  router.push({ name: 'epic', params: { epicId: epicId.value } })
}

// ─── Mutations ───
async function onToggleAC(index: number, done: boolean) {
  if (pendingAC.value.has(index)) return
  pendingAC.value = new Set([...pendingAC.value, index])
  await store.toggleAC(epicId.value, storyId.value, index, done)
  pendingAC.value = new Set([...pendingAC.value].filter(i => i !== index))
}

async function onToggleTask(taskId: string, done: boolean) {
  if (pendingTask.value.has(taskId)) return
  pendingTask.value = new Set([...pendingTask.value, taskId])
  await store.toggleTask(epicId.value, storyId.value, taskId, done)
  pendingTask.value = new Set([...pendingTask.value].filter(i => i !== taskId))
}

async function onStatusChange(status: string) {
  if (pendingStatus.value) return
  pendingStatus.value = true
  await store.updateStoryStatus(epicId.value, storyId.value, status)
  pendingStatus.value = false
}

// ─── Commits panel ───
const storyCommits = computed(() =>
  store.commitMappings.filter((c: CommitMapping) => c.storyId === storyId.value)
)

function shortSha(sha: string) { return sha.slice(0, 7) }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── Collapsible files per commit ───
const expandedCommits = ref<Set<string>>(new Set())
function toggleFiles(sha: string) {
  const next = new Set(expandedCommits.value)
  if (next.has(sha)) { next.delete(sha) } else { next.add(sha) }
  expandedCommits.value = next
}
function scoreLabel(score: number) { return Math.round(score * 100) + '%' }

// ─── Tab state ───
const activeTab = ref<'requirements' | 'visualizer'>('requirements')
const markdownHtml = ref('')
const markdownLoading = ref(false)
const markdownError = ref('')

function filterMarkdown(md: string): string {
  const lines = md.split('\n')
  const result: string[] = []
  let blockedLevel = 0
  const headingRe = /^(#{1,6})\s+(.+)/
  const blockedPattern = /^(acceptance criteria|tasks?(\s*[/|].*)?|sub-?tasks?)/i
  for (const line of lines) {
    const match = headingRe.exec(line)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      if (blockedLevel > 0 && level <= blockedLevel) {
        // End of blocked section — check if new heading is also blocked
        blockedLevel = 0
      }
      if (blockedLevel === 0) {
        if (blockedPattern.test(text)) {
          blockedLevel = level
          // Drop this heading line
        } else {
          result.push(line)
        }
      }
    } else {
      if (blockedLevel === 0) result.push(line)
    }
  }
  return result.join('\n')
}

async function loadMarkdown() {
  if (markdownHtml.value) return  // already loaded for this story
  markdownLoading.value = true
  markdownError.value = ''
  try {
    const res = await fetch(`/api/epics/${epicId.value}/stories/${storyId.value}/markdown`)
    if (!res.ok) { markdownError.value = 'No source file available for this story.'; return }
    const text = await res.text()
    markdownHtml.value = renderMarkdown(filterMarkdown(text))
  } catch {
    markdownError.value = 'Failed to load source file.'
  } finally {
    markdownLoading.value = false
  }
}

function onTabChange(tab: 'requirements' | 'visualizer') {
  activeTab.value = tab
  if (tab === 'visualizer') loadMarkdown()
}

// Reset markdown state when story changes
watch(storyId, () => {
  markdownHtml.value = ''
  markdownError.value = ''
  activeTab.value = 'requirements'
})
</script>

<template>
  <div v-if="story" class="story-detail">

    <!-- Sticky header: breadcrumb, meta, title, status, tabs -->
    <div class="story-header">

      <!-- Back breadcrumb -->
      <button class="breadcrumb" @click="goBack">← {{ epic?.title }}</button>

      <!-- Identifier badges -->
      <div class="story-meta">
        <span class="meta-badge">Epic {{ epicId }}</span>
        <span class="meta-sep">·</span>
        <span class="meta-badge">Story {{ storyId }}</span>
      </div>

      <!-- Title -->
      <h1 class="story-title">{{ story.title }}</h1>

      <!-- Status button group -->
      <div class="status-group">
        <button
          v-for="s in STATUSES"
          :key="s.key"
          class="status-btn"
          :class="{ 'is-active': story.status === s.key }"
          :style="story.status === s.key ? { color: `var(${s.colorVar})`, background: `var(${s.bgVar})`, borderColor: `var(${s.colorVar})` } : {}"
          :disabled="pendingStatus"
          @click="onStatusChange(s.key)"
        >{{ s.label }}</button>
      </div>

      <!-- Tab bar -->
      <div class="story-tabs">
        <button
          class="story-tab"
          :class="{ 'is-active': activeTab === 'requirements' }"
          @click="onTabChange('requirements')"
        >Requirements</button>
        <button
          class="story-tab"
          :class="{ 'is-active': activeTab === 'visualizer' }"
          @click="onTabChange('visualizer')"
        >Visualizer</button>
      </div>

    </div>

    <div class="story-columns">

      <div class="story-body">

        <!-- Requirements tab content -->
        <div v-if="activeTab === 'requirements'">

          <!-- Description -->
          <p v-if="story.description" class="story-description">{{ story.description }}</p>

          <!-- Acceptance Criteria -->
          <section v-if="story.acceptanceCriteria.length > 0" class="detail-section">
            <h3 class="section-title">Acceptance Criteria</h3>
            <ul class="checklist">
              <li v-for="(ac, index) in story.acceptanceCriteria" :key="ac.id" class="checklist-item">
                <label :class="{ 'is-done': ac.done }">
                  <input
                    type="checkbox"
                    :checked="ac.done"
                    :disabled="pendingAC.has(index)"
                    @change="onToggleAC(index, !ac.done)"
                  />
                  <span>{{ ac.description }}</span>
                </label>
              </li>
            </ul>
          </section>

          <!-- Tasks -->
          <section v-if="story.tasks.length > 0" class="detail-section">
            <h3 class="section-title">Tasks</h3>
            <ul class="checklist">
              <li v-for="task in story.tasks" :key="task.id" class="checklist-item">
                <label :class="{ 'is-done': task.done }">
                  <input
                    type="checkbox"
                    :checked="task.done"
                    :disabled="pendingTask.has(task.id)"
                    @change="onToggleTask(task.id, !task.done)"
                  />
                  <span>{{ task.description }}</span>
                </label>
                <!-- Subtasks (one level only) -->
                <ul v-if="task.subtasks && task.subtasks.length > 0" class="checklist subtask-list">
                  <li v-for="sub in task.subtasks" :key="sub.id" class="checklist-item">
                    <label :class="{ 'is-done': sub.done }">
                      <input
                        type="checkbox"
                        :checked="sub.done"
                        :disabled="pendingTask.has(sub.id)"
                        @change="onToggleTask(sub.id, !sub.done)"
                      />
                      <span>{{ sub.description }}</span>
                    </label>
                  </li>
                </ul>
              </li>
            </ul>
          </section>

        </div>

        <!-- Visualizer tab content -->
        <div v-else-if="activeTab === 'visualizer'" class="visualizer-panel">
          <p v-if="markdownLoading" class="viz-loading">Loading...</p>
          <p v-else-if="markdownError" class="viz-error">{{ markdownError }}</p>
          <div v-else class="viz-content" v-html="markdownHtml"></div>
        </div>

      </div>

      <!-- Sticky commits panel -->
      <aside class="commits-panel">
        <h3 class="section-title">Related Commits</h3>
        <ul v-if="storyCommits.length > 0" class="commits-list">
          <li v-for="c in storyCommits" :key="c.sha" class="commit-item">
            <span class="commit-sha">{{ shortSha(c.sha) }}<span class="commit-score">{{ scoreLabel(c.score) }}</span></span>
            <span class="commit-msg">{{ c.message }}</span>
            <span class="commit-date">{{ formatDate(c.date) }}</span>
            <button
              class="commit-files-toggle"
              @click="toggleFiles(c.sha)"
            >{{ expandedCommits.has(c.sha) ? '▾' : '▸' }} Files ({{ c.files.length }})</button>
            <ul class="commit-files" v-show="expandedCommits.has(c.sha)">
              <li v-for="f in c.files" :key="f" class="commit-file">{{ f }}</li>
            </ul>
          </li>
        </ul>
        <p v-else class="commits-empty">No related commits found.</p>
      </aside>

    </div>

  </div>

  <!-- Empty state -->
  <div v-else class="story-empty">Select a story</div>
</template>

<style scoped>
.story-detail {
  padding: 0;
  padding-bottom: 2rem;
  height: 100%;
  overflow-y: auto;
}

.story-header {
  position: sticky;
  top: 0;
  background: var(--bg-0);
  z-index: 10;
  padding: 1.5rem 2rem 0;
  margin-bottom: 1.5rem;
  border-bottom: none;
}

.story-columns {
  display: flex;
  gap: 2rem;
  align-items: flex-start;
  padding: 0 2rem;
}

.story-body {
  flex: 1 1 0;
  min-width: 0;
}

.commits-panel {
  flex: 0 0 280px;
  position: sticky;
  top: 188px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}

.commits-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.commit-item {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.commit-sha {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--accent);
  letter-spacing: 0.04em;
}

.commit-msg {
  font-size: 0.8rem;
  color: var(--text-1);
  line-height: 1.4;
  word-break: break-word;
}

.commit-date {
  font-size: 0.72rem;
  color: var(--text-3);
}

.commits-empty {
  font-size: 0.8rem;
  color: var(--text-3);
  margin-top: 0.5rem;
}

.breadcrumb {
  background: none;
  border: none;
  color: var(--text-2);
  font-size: 0.85rem;
  cursor: pointer;
  padding: 0;
  margin-bottom: 1.25rem;
  display: block;
  transition: color 0.15s;
}
.breadcrumb:hover { color: var(--text-1); }

.story-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.6rem;
}

.meta-badge {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--accent);
  background: var(--accent-dim);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 0.15rem 0.5rem;
  letter-spacing: 0.03em;
  opacity: 0.8;
}

.meta-sep {
  color: var(--text-3);
  font-size: 0.75rem;
}

.story-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-0);
  margin-bottom: 1rem;
}

.status-group {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0;
}

.status-btn {
  padding: 0.35rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.status-btn:hover:not(:disabled) {
  border-color: var(--border-hover);
  color: var(--text-1);
}
.status-btn:disabled { opacity: 0.6; cursor: default; }

.story-description {
  color: var(--text-2);
  font-size: 0.9rem;
  line-height: 1.7;
  margin-bottom: 1.75rem;
  white-space: pre-wrap;
}

.detail-section {
  margin-bottom: 1.75rem;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-3);
  margin-bottom: 0.75rem;
}

.checklist {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.checklist-item label {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  cursor: pointer;
  color: var(--text-1);
  font-size: 0.875rem;
  line-height: 1.55;
}

.checklist-item input[type="checkbox"] {
  margin-top: 0.2rem;
  flex-shrink: 0;
  cursor: pointer;
  accent-color: var(--accent);
}

.is-done {
  text-decoration: line-through;
  color: var(--text-3);
}

.subtask-list {
  margin-left: 1.5rem;
  margin-top: 0.4rem;
}

.story-empty {
  padding: 2rem;
  color: var(--text-2);
  font-size: 0.85rem;
}

.commit-score {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--accent);
  opacity: 0.75;
  margin-left: 0.4rem;
}

.commit-files-toggle {
  background: none;
  border: none;
  padding: 0;
  margin-top: 0.1rem;
  font-size: 0.7rem;
  color: var(--text-3);
  cursor: pointer;
  text-align: left;
  transition: color 0.15s;
}
.commit-files-toggle:hover { color: var(--text-2); }

.commit-files {
  list-style: none;
  margin: 0.25rem 0 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.commit-file {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--text-3);
  word-break: break-all;
}

/* ─── Tab bar ─── */
.story-tabs {
  display: flex;
  gap: 0;
  margin-top: 1rem;
  border-bottom: 1px solid var(--border);
}

.story-tab {
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.4rem 1rem;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-2);
  cursor: pointer;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.story-tab:hover { color: var(--text-1); }

.story-tab.is-active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* ─── Visualizer panel ─── */
.visualizer-panel {
  padding-top: 0.5rem;
}

.viz-loading,
.viz-error {
  font-size: 0.85rem;
  color: var(--text-3);
  margin-top: 1rem;
}

.viz-error { color: var(--text-2); }

.viz-content {
  font-size: 0.9rem;
  line-height: 1.7;
  color: var(--text-1);
}

.viz-content :deep(> *:first-child) { margin-top: 0; }

.viz-content :deep(h1) {
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--accent);
  margin: 1.75rem 0 0.6rem;
  letter-spacing: -0.01em;
}
.viz-content :deep(h2) {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-0);
  margin: 1.5rem 0 0.5rem;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3rem;
}
.viz-content :deep(h3) {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-1);
  text-transform: none;
  letter-spacing: 0;
  margin: 1.25rem 0 0.4rem;
}
.viz-content :deep(h4) {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-1);
  margin: 1rem 0 0.3rem;
}
.viz-content :deep(h5) {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-2);
  margin: 0.9rem 0 0.25rem;
}
.viz-content :deep(h6) {
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--text-3);
  margin: 0.8rem 0 0.2rem;
}

.viz-content :deep(p) { margin-bottom: 1rem; }

.viz-content :deep(ul),
.viz-content :deep(ol) {
  padding-left: 2.25rem;
  margin-bottom: 0.75rem;
}

.viz-content :deep(li) { margin-bottom: 0.45rem; padding-top: 0.1rem; }

.viz-content :deep(code) {
  font-family: var(--font-mono);
  font-size: 0.82em;
  background: var(--bg-2);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  color: var(--accent);
}

.viz-content :deep(blockquote) {
  border-left: 3px solid var(--accent);
  margin: 0 0 1rem 0;
  padding: 0.5rem 0 0.5rem 1rem;
  color: var(--text-2);
  background: var(--bg-1);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.viz-content :deep(pre) {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0;
  overflow-x: auto;
  margin-bottom: 1rem;
  font-size: 0.82rem;
  line-height: 1.6;
}

.viz-content :deep(pre code.hljs) {
  border-radius: var(--radius);
  padding: 1rem 1.25rem;
  font-size: 0.82rem;
}

.viz-content :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.25rem 0;
}

.viz-content :deep(strong) { color: var(--text-0); font-weight: 600; }
.viz-content :deep(em) { color: var(--text-2); }
</style>
