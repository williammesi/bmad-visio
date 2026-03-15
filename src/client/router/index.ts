import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import EpicView from '../views/EpicView.vue'
import StoryDetailView from '../views/StoryDetailView.vue'
import OverviewView from '../views/OverviewView.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/overview', name: 'overview', component: OverviewView },
    { path: '/', name: 'home', component: HomeView },
    { path: '/epic/:epicId', name: 'epic', component: EpicView },
    { path: '/epic/:epicId/story/:storyId', name: 'storyDetail', component: StoryDetailView },
  ],
})

export default router
