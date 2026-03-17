<template>
  <div class="app-layout">
    <header class="top-bar">
      <span class="top-bar-brand">BMAD-VISIO</span>
    </header>
    <aside class="sidebar">
      <SidebarTree />
    </aside>
    <main class="main-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
import SidebarTree from './SidebarTree.vue'
</script>

<style scoped>
.app-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: 44px 1fr;
  height: 100vh;
  overflow: hidden;
}

.top-bar {
  grid-column: 1 / -1;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 1.25rem;
  position: sticky;
  top: 0;
  z-index: 100;
}

.top-bar-brand {
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-0);
  text-transform: uppercase;
}

.sidebar {
  background: var(--bg-1);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.main-content {
  overflow: auto;
  background: var(--bg-0);
}
</style>
