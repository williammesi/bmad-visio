<template>
  <nav class="sidebar-tree">
    <button
      class="overview-btn"
      :class="{ active: isOverviewActive }"
      @click="goToOverview"
    >
      Overview
    </button>
    <div class="sidebar-header">
      <span class="sidebar-header-label">Epics ({{ store.epics.length }}):</span>
      <button class="collapse-all-btn" @click="toggleAll" :title="allExpanded ? 'Collapse all' : 'Expand all'">
        {{ allExpanded ? '⊟' : '⊞' }}
      </button>
    </div>
    <SidebarEpicItem
      v-for="epic in store.epics"
      :key="epic.id"
      :epic="epic"
      :is-expanded="isExpanded(epic.id)"
      :is-active="activeEpicId === epic.id"
      @toggle="toggleEpic(epic.id)"
      @select="selectEpic(epic.id)"
    >
      <SidebarStoryItem
        v-for="story in epic.stories"
        :key="story.id"
        :story="story"
        :is-active="activeStoryId === story.id"
        @select="selectStory(epic.id, story.id)"
      />
    </SidebarEpicItem>
  </nav>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useProjectStore } from '../stores/project'
import SidebarEpicItem from './SidebarEpicItem.vue'
import SidebarStoryItem from './SidebarStoryItem.vue'

// ─── Store & Router ───
const store = useProjectStore()
const route = useRoute()
const router = useRouter()

// ─── Active State (source of truth: route params) ───
const activeEpicId = computed(() => route.params.epicId as string | undefined)
const activeStoryId = computed(() => route.params.storyId as string | undefined)
const isOverviewActive = computed(() => route.name === 'overview')

// ─── Expand/Collapse State ───
// Must replace Set (not mutate) to trigger Vue 3 reactivity
const expandedEpicIds = ref<Set<string>>(new Set())

// Initialize: expand first epic once store data is available
watch(
  () => store.epics,
  (epics) => {
    if (epics.length > 0 && expandedEpicIds.value.size === 0) {
      expandedEpicIds.value = new Set([epics[0].id])
    }
  },
  { immediate: true }
)

// Auto-expand active epic on navigation so active story stays visible
watch(activeEpicId, (id) => {
  if (id && !expandedEpicIds.value.has(id)) {
    expandedEpicIds.value = new Set([...expandedEpicIds.value, id])
  }
}, { immediate: true })

function isExpanded(epicId: string): boolean {
  return expandedEpicIds.value.has(epicId)
}

function toggleEpic(epicId: string): void {
  const next = new Set(expandedEpicIds.value)
  if (next.has(epicId)) {
    next.delete(epicId)
  } else {
    next.add(epicId)
  }
  expandedEpicIds.value = next
}

// ─── Collapse/Expand All ───
const allExpanded = computed(() =>
  store.epics.length > 0 && store.epics.every(e => expandedEpicIds.value.has(e.id))
)

function toggleAll(): void {
  if (allExpanded.value) {
    expandedEpicIds.value = new Set()
  } else {
    expandedEpicIds.value = new Set(store.epics.map(e => e.id))
  }
}

// ─── Navigation Actions ───
function goToOverview(): void {
  router.push({ name: 'overview' })
}

function selectEpic(epicId: string): void {
  store.selectEpic(epicId)
  router.push({ name: 'epic', params: { epicId } })
}

function selectStory(epicId: string, storyId: string): void {
  router.push({ name: 'storyDetail', params: { epicId, storyId } })
}

// ─── Initial Load Navigation ───
// Sync: production has __INITIAL_DATA__ — store is populated before mount
// Async: dev fetches /api/project — store.selectedEpicId may be null at mount
function maybeNavigateToFirstEpic(): void {
  if (route.name === 'home' && store.selectedEpicId) {
    router.push({ name: 'epic', params: { epicId: store.selectedEpicId } })
  }
}

onMounted(maybeNavigateToFirstEpic)

// Dev fallback: watch for first non-null selectedEpicId after async hydration
watch(() => store.selectedEpicId, (id) => {
  if (id && route.name === 'home') {
    router.push({ name: 'epic', params: { epicId: id } })
  }
}, { once: true })
</script>

<style scoped>
.sidebar-tree {
  padding: 8px 0;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 6px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
}

.sidebar-header-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-2);
}

.collapse-all-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-2);
  font-size: 1rem;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  line-height: 1;
}

.collapse-all-btn:hover {
  color: var(--text-0);
  background: var(--bg-3);
}

.overview-btn {
  display: block;
  width: calc(100% - 16px);
  margin: 4px 8px 8px 8px;
  padding: 7px 12px;
  text-align: left;
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-1);
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.overview-btn:hover {
  background: var(--bg-3);
  border-color: var(--border-hover);
  color: var(--text-0);
}

.overview-btn.active {
  background: var(--accent-dim);
  border-color: var(--accent);
  color: var(--accent);
}
</style>
