import express from "express";
import { updateStoryStatus, toggleAcceptanceCriteria, toggleTask, BOARD_COLUMNS } from "../parser/index.js";
import type { BmadProject } from "../types/index.js";
import type { BoardStatus } from "../parser/index.js";

export function createServer(project: BmadProject, port: number) {
  const app = express();
  app.use(express.json());

  app.get("/api/project", (_req, res) => res.json(project));
  app.get("/api/epics", (_req, res) => res.json(project.epics));
  app.get("/api/epics/:id", (req, res) => {
    const epic = project.epics.find((e) => e.id === req.params.id);
    if (!epic) return res.status(404).json({ error: "Epic not found" });
    res.json(epic);
  });
  app.get("/api/commits", (_req, res) => res.json(project.commitMappings ?? []));

  app.patch("/api/epics/:epicId/stories/:storyId/status", (req, res) => {
    const { epicId, storyId } = req.params;
    const { status } = req.body as { status: string };
    if (!BOARD_COLUMNS.includes(status as BoardStatus))
      return res.status(400).json({ error: `Invalid status` });
    const result = updateStoryStatus(project, epicId, storyId, status as BoardStatus);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json({ ok: true });
  });

  app.patch("/api/epics/:epicId/stories/:storyId/ac/:acIndex", (req, res) => {
    const { epicId, storyId, acIndex } = req.params;
    const { done } = req.body as { done: boolean };
    const idx = parseInt(acIndex, 10);
    if (isNaN(idx) || typeof done !== "boolean")
      return res.status(400).json({ error: "Invalid request" });
    const result = toggleAcceptanceCriteria(project, epicId, storyId, idx, done);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json({ ok: true });
  });

  app.patch("/api/epics/:epicId/stories/:storyId/task/:taskId", (req, res) => {
    const { epicId, storyId, taskId } = req.params;
    const { done } = req.body as { done: boolean };
    if (typeof done !== "boolean") return res.status(400).json({ error: "Invalid request" });
    const result = toggleTask(project, epicId, storyId, taskId, done);
    if (!result.ok) return res.status(404).json({ error: result.error });
    res.json({ ok: true });
  });

  app.get("/", (_req, res) => res.send(dashboardHtml(project)));

  const server = app.listen(port, () => {
    console.log(`\n  🚀  BMAD Dashboard running at http://localhost:${port}\n`);
  });
  return server;
}

function dashboardHtml(project: BmadProject): string {
  // Serialize data for frontend
  const projectData = JSON.stringify({
    name: project.name,
    epics: project.epics,
    commits: project.commitMappings ?? [],
  });

  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${project.name} — BMAD Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
:root {
  --bg-0:#08090c;--bg-1:#0e1015;--bg-2:#151820;--bg-3:#1c2029;
  --border:#252a35;--border-hover:#3a4155;
  --text-0:#f0f2f5;--text-1:#c1c7d4;--text-2:#7c849a;--text-3:#4a5168;
  --accent:#6c8cff;--accent-dim:#6c8cff22;
  --done:#34d399;--done-bg:#34d39915;
  --active:#fbbf24;--active-bg:#fbbf2415;
  --review:#a78bfa;--review-bg:#a78bfa15;
  --todo:#64748b;--todo-bg:#64748b12;
  --radius:10px;--radius-sm:6px;
  --font-display:'Outfit',sans-serif;--font-mono:'JetBrains Mono',monospace;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--font-display);background:var(--bg-0);color:var(--text-1);line-height:1.55;min-height:100vh}
.topbar{position:sticky;top:0;z-index:50;display:flex;align-items:center;gap:1rem;padding:.75rem 2rem;background:var(--bg-0);border-bottom:1px solid var(--border)}
.topbar-logo{font-family:var(--font-mono);font-weight:700;font-size:.85rem;color:var(--accent);letter-spacing:.04em}
.topbar-breadcrumb{display:flex;align-items:center;gap:.4rem;font-size:.82rem;color:var(--text-2)}
.topbar-breadcrumb a{color:var(--text-2);text-decoration:none}.topbar-breadcrumb a:hover{color:var(--text-0)}
.topbar-breadcrumb .sep{opacity:.4}
.page{padding:2rem;max-width:1400px;margin:0 auto}
.view{animation:fadeIn .2s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.stats-row{display:flex;gap:.75rem;margin-bottom:2rem;flex-wrap:wrap}
.stat{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);padding:.85rem 1.25rem;min-width:120px}
.stat .val{font-size:1.6rem;font-weight:700;color:var(--text-0);font-family:var(--font-mono)}
.stat .lbl{font-size:.72rem;color:var(--text-2);text-transform:uppercase;letter-spacing:.06em;margin-top:.15rem}
.epic-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem}
.epic-card{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);padding:1.25rem;cursor:pointer;transition:all .18s;position:relative;overflow:hidden}
.epic-card:hover{border-color:var(--border-hover);transform:translateY(-2px)}
.epic-card:hover .epic-card-glow{opacity:1}
.epic-card-glow{position:absolute;inset:0;opacity:0;transition:opacity .3s;background:radial-gradient(circle at 50% 0%,var(--accent-dim),transparent 60%);pointer-events:none}
.epic-card .eid{font-family:var(--font-mono);font-size:.7rem;color:var(--accent);font-weight:600;letter-spacing:.04em}
.epic-card h2{font-size:1.05rem;font-weight:600;color:var(--text-0);margin:.4rem 0 .5rem}
.epic-card p{font-size:.8rem;color:var(--text-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.epic-card .epic-meta{display:flex;gap:1rem;margin-top:.85rem;font-size:.75rem}
.epic-card .epic-meta span{color:var(--text-2)}.epic-card .epic-meta strong{color:var(--text-0);font-weight:600}
.epic-card .epic-progress-bar{margin-top:.85rem;height:3px;background:var(--bg-3);border-radius:2px;overflow:hidden}
.epic-card .epic-progress-fill{height:100%;border-radius:2px;transition:width .4s ease}
.epic-title-row{margin-bottom:1.5rem}
.epic-title-row h1{font-size:1.3rem;font-weight:600;color:var(--text-0)}
.epic-title-row .eid-tag{font-family:var(--font-mono);font-size:.72rem;color:var(--accent);margin-bottom:.3rem;display:inline-block}
.epic-title-row .epic-desc{font-size:.85rem;color:var(--text-2);margin-top:.4rem;max-width:700px}
.kanban{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem}
@media(max-width:1000px){.kanban{grid-template-columns:repeat(2,1fr)}}
@media(max-width:600px){.kanban{grid-template-columns:1fr}}
.kanban-col{min-height:120px}
.kanban-col-header{display:flex;align-items:center;gap:.5rem;padding:.5rem 0;margin-bottom:.5rem;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em}
.kanban-col-header .dot{width:8px;height:8px;border-radius:50%}
.kanban-col-header .count{color:var(--text-3);font-weight:400;margin-left:auto;font-family:var(--font-mono)}
.kanban-col-body{min-height:60px;border:1px dashed var(--border);border-radius:var(--radius);padding:.5rem;transition:border-color .15s,background .15s}
.kanban-col-body.drag-over{border-color:var(--accent);background:var(--accent-dim)}
.kanban-col-body:empty::after{content:'No stories';display:block;text-align:center;padding:1.5rem 0;color:var(--text-3);font-size:.8rem}
.story-card{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);padding:.85rem;margin-bottom:.5rem;cursor:grab;transition:all .15s;position:relative}
.story-card:hover{border-color:var(--border-hover);background:var(--bg-2)}
.story-card.dragging{opacity:.4}
.story-card .sid{font-family:var(--font-mono);font-size:.68rem;color:var(--accent);font-weight:600}
.story-card h3{font-size:.85rem;font-weight:500;color:var(--text-0);margin:.25rem 0;padding-right:3rem}
.story-card .story-ac-bar{display:flex;align-items:center;gap:.5rem;margin-top:.4rem}
.story-card .story-ac-bar .bar-track{flex:1;height:3px;background:var(--bg-3);border-radius:2px;overflow:hidden}
.story-card .story-ac-bar .bar-fill{height:100%;border-radius:2px}
.story-card .story-ac-bar .bar-label{font-family:var(--font-mono);font-size:.65rem;color:var(--text-3);white-space:nowrap}
.arrow-row{position:absolute;top:.65rem;right:.6rem;display:flex;gap:.2rem}
.arrow-btn{width:22px;height:22px;border:1px solid var(--border);border-radius:4px;background:var(--bg-2);color:var(--text-2);font-size:.65rem;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .12s;padding:0}
.arrow-btn:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-dim)}
.arrow-btn:disabled{opacity:.2;cursor:default;pointer-events:none}
.badge{display:inline-block;font-size:.6rem;font-weight:600;padding:.2rem .55rem;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}
.badge-done{background:var(--done-bg);color:var(--done)}.badge-active{background:var(--active-bg);color:var(--active)}
.badge-review{background:var(--review-bg);color:var(--review)}.badge-todo{background:var(--todo-bg);color:var(--todo)}
.story-detail{max-width:860px}
.story-detail .story-meta-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.65rem;margin:1.25rem 0 1.5rem}
.story-detail .meta-item{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.7rem .85rem}
.story-detail .meta-item .mk{font-size:.65rem;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em}
.story-detail .meta-item .mv{font-size:.85rem;color:var(--text-0);margin-top:.15rem;font-weight:500}
.story-detail h1{font-size:1.3rem;font-weight:600;color:var(--text-0)}
.story-detail .sid-tag{font-family:var(--font-mono);font-size:.75rem;color:var(--accent);margin-bottom:.35rem;display:inline-block}
.story-section{margin-top:1.5rem}
.story-section h2{font-size:.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--text-2);margin-bottom:.75rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)}
.story-user-story{background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.25rem;font-size:.88rem;color:var(--text-1);white-space:pre-line}
.ac-table{width:100%;border-collapse:collapse}
.ac-table tr{border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s}
.ac-table tr:hover{background:var(--bg-2)}.ac-table tr:last-child{border-bottom:none}
.ac-table td{padding:.55rem .5rem;vertical-align:top;font-size:.82rem}
.ac-table .ac-idx{width:40px;font-family:var(--font-mono);font-size:.7rem;color:var(--text-3);text-align:center}
.ac-table .ac-status{width:28px;text-align:center;font-size:.9rem}
.ac-table .ac-text{color:var(--text-1)}.ac-table .ac-text.is-done{color:var(--text-2);text-decoration:line-through;text-decoration-color:var(--text-3)}
.back-link{display:inline-flex;align-items:center;gap:.3rem;font-size:.8rem;color:var(--text-2);text-decoration:none;margin-bottom:1rem}
.back-link:hover{color:var(--accent)}
.progress-ring{margin:1.25rem 0;display:flex;align-items:center;gap:1rem}
.progress-ring .pr-text .pr-pct{font-size:1.4rem;font-weight:700;color:var(--text-0);font-family:var(--font-mono)}
.progress-ring .pr-text .pr-label{font-size:.72rem;color:var(--text-2)}
.task-list{list-style:none}
.task-item{padding:.4rem .5rem;border-bottom:1px solid var(--border);font-size:.82rem;cursor:pointer;transition:background .12s;display:flex;align-items:flex-start;gap:.5rem}
.task-item:hover{background:var(--bg-2)}.task-item:last-child{border-bottom:none}
.task-check{flex-shrink:0;font-size:.85rem;margin-top:.05rem}
.task-text{color:var(--text-1)}.task-text.is-done{color:var(--text-2);text-decoration:line-through;text-decoration-color:var(--text-3)}
.subtask-list{margin-left:1.5rem;margin-top:.2rem}
.subtask-item{font-size:.78rem;padding:.2rem 0;display:flex;align-items:flex-start;gap:.4rem;color:var(--text-2)}
/* Commits */
.commit-list{list-style:none}
.commit-item{padding:.65rem .75rem;background:var(--bg-1);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:.45rem;display:flex;align-items:flex-start;gap:.75rem}
.commit-sha{font-family:var(--font-mono);font-size:.7rem;color:var(--accent);font-weight:600;flex-shrink:0;min-width:60px}
.commit-body{flex:1;min-width:0}
.commit-msg{font-size:.82rem;color:var(--text-0);margin-bottom:.2rem}
.commit-desc{font-size:.75rem;color:var(--text-2);margin-bottom:.3rem;white-space:pre-line}
.commit-meta{font-size:.7rem;color:var(--text-3);display:flex;gap:.75rem;flex-wrap:wrap}
.commit-score{font-family:var(--font-mono);font-size:.65rem;padding:.1rem .4rem;border-radius:10px;background:var(--accent-dim);color:var(--accent)}
.commit-files{margin-top:.35rem;font-size:.7rem;color:var(--text-3);font-family:var(--font-mono)}
.commit-files summary{cursor:pointer;color:var(--text-2)}.commit-files summary:hover{color:var(--accent)}
.no-commits{color:var(--text-3);font-size:.82rem;font-style:italic}
.toast{position:fixed;bottom:1.5rem;right:1.5rem;z-index:100;background:var(--bg-2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:.6rem 1rem;font-size:.8rem;color:var(--text-1);opacity:0;transform:translateY(8px);transition:all .2s}
.toast.show{opacity:1;transform:translateY(0)}.toast.success{border-color:var(--done);color:var(--done)}.toast.error{border-color:#f87171;color:#f87171}
</style>
</head>
<body>
<div class="topbar"><span class="topbar-logo">BMAD</span><div class="topbar-breadcrumb" id="breadcrumb"></div></div>
<div class="page" id="app"></div>
<div class="toast" id="toast"></div>

<script>
const PROJECT = ${projectData};
const COLUMNS=[{key:'todo',label:'To Do',color:'var(--todo)'},{key:'active',label:'Active',color:'var(--active)'},{key:'review',label:'Ready for Review',color:'var(--review)'},{key:'done',label:'Done',color:'var(--done)'}];
const COL_KEYS=COLUMNS.map(c=>c.key);

function showToast(msg,type){const el=document.getElementById('toast');el.textContent=msg;el.className='toast show '+(type||'');clearTimeout(el._t);el._t=setTimeout(()=>el.className='toast',2000)}

async function apiPatch(url,body){
  try{const res=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data=await res.json();if(!res.ok){showToast(data.error||'Failed','error');return false}return true}
  catch(e){showToast('Network error','error');return false}
}
async function moveStory(eId,sId,status){
  const epic=PROJECT.epics.find(e=>e.id===eId);const story=epic?.stories.find(s=>s.id===sId);
  if(await apiPatch('/api/epics/'+encodeURIComponent(eId)+'/stories/'+encodeURIComponent(sId)+'/status',{status})){
    if(story)story.status=status;showToast('Story '+sId+' → '+COLUMNS.find(c=>c.key===status).label,'success');return true}return false}
async function toggleAC(eId,sId,acIdx,done){
  if(await apiPatch('/api/epics/'+encodeURIComponent(eId)+'/stories/'+encodeURIComponent(sId)+'/ac/'+acIdx,{done})){
    const epic=PROJECT.epics.find(e=>e.id===eId);const story=epic?.stories.find(s=>s.id===sId);
    const ac=story?.acceptanceCriteria.find(a=>a.id==='AC-'+acIdx);if(ac)ac.done=done;showToast('AC-'+acIdx+(done?' ✓':' ○'),'success');return true}return false}
async function toggleTaskFn(eId,sId,taskId,done){
  if(await apiPatch('/api/epics/'+encodeURIComponent(eId)+'/stories/'+encodeURIComponent(sId)+'/task/'+encodeURIComponent(taskId),{done})){
    const epic=PROJECT.epics.find(e=>e.id===eId);const story=epic?.stories.find(s=>s.id===sId);
    if(story){for(const t of story.tasks){if(t.id===taskId){t.done=done;break}if(t.subtasks){const sub=t.subtasks.find(s=>s.id===taskId);if(sub){sub.done=done;break}}}}
    showToast(taskId+(done?' ✓':' ○'),'success');return true}return false}

function navigate(hash){window.location.hash=hash}
function route(){
  const hash=window.location.hash||'#/';const app=document.getElementById('app');const bc=document.getElementById('breadcrumb');
  if(hash.startsWith('#/epic/')&&hash.includes('/story/')){
    const parts=hash.replace('#/epic/','').split('/story/');const epicId=decodeURIComponent(parts[0]);const storyId=decodeURIComponent(parts[1]);
    const epic=PROJECT.epics.find(e=>e.id===epicId);const story=epic?.stories.find(s=>s.id===storyId);
    if(epic&&story){bc.innerHTML=breadcrumb([{label:PROJECT.name,href:'#/'},{label:epic.id,href:'#/epic/'+encodeURIComponent(epic.id)},{label:'Story '+story.id}]);app.innerHTML=renderStoryDetail(epic,story)}
  }else if(hash.startsWith('#/epic/')){
    const epicId=decodeURIComponent(hash.replace('#/epic/',''));const epic=PROJECT.epics.find(e=>e.id===epicId);
    if(epic){bc.innerHTML=breadcrumb([{label:PROJECT.name,href:'#/'},{label:epic.id+' — '+epic.title}]);app.innerHTML=renderEpicKanban(epic);setupDragAndDrop(epic)}
  }else{bc.innerHTML=breadcrumb([{label:PROJECT.name}]);app.innerHTML=renderHome()}
}
window.addEventListener('hashchange',route);route();

function breadcrumb(items){return items.map((item,i)=>{if(item.href&&i<items.length-1)return '<a href="'+item.href+'">'+item.label+'</a>';return '<span style="color:var(--text-0)">'+item.label+'</span>'}).join('<span class="sep"> / </span>')}
function statusLabel(s){const c=COLUMNS.find(c=>c.key===s);return c?c.label:'To Do'}
function badgeHtml(s){return '<span class="badge badge-'+(s||'todo')+'">'+statusLabel(s)+'</span>'}
function taskProgress(story){
  let done=0,total=0;
  story.tasks.forEach(t=>{total++;if(t.done)done++;if(t.subtasks)t.subtasks.forEach(s=>{total++;if(s.done)done++})});
  return {done,total,pct:total>0?Math.round(done/total*100):0};
}
function acProgress(story){const done=story.acceptanceCriteria.filter(ac=>ac.done).length;const total=story.acceptanceCriteria.length;return {done,total,pct:total>0?Math.round(done/total*100):0}}
function progressColor(pct){if(pct===100)return'var(--done)';if(pct>0)return'var(--active)';return'var(--todo)'}
function stat(val,label){return '<div class="stat"><div class="val">'+val+'</div><div class="lbl">'+label+'</div></div>'}
function storyCommits(storyId){return (PROJECT.commits||[]).filter(c=>c.storyId===storyId).sort((a,b)=>new Date(b.date)-new Date(a.date))}

// ── HOME ────────────────────────────
function renderHome(){
  const ts=PROJECT.epics.reduce((n,e)=>n+e.stories.length,0);
  const ds=PROJECT.epics.reduce((n,e)=>n+e.stories.filter(s=>s.status==='done').length,0);
  const mc=(PROJECT.commits||[]).filter(c=>c.storyId).length;const tc=(PROJECT.commits||[]).length;
  return '<div class="view"><div class="stats-row">'+stat(PROJECT.epics.length,'Epics')+stat(ts,'Stories')+stat(ds+'/'+ts,'Done')+(tc>0?stat(mc+'/'+tc,'Commits Mapped'):'')+'</div><div class="epic-grid">'+PROJECT.epics.map(renderEpicCard).join('')+'</div></div>'}
function renderEpicCard(epic){
  const tp=taskProgress({tasks:epic.stories.flatMap(s=>s.tasks||[]),acceptanceCriteria:[]});
  const ds=epic.stories.filter(s=>s.status==='done').length;
  return '<div class="epic-card" onclick="navigate(\\'#/epic/'+encodeURIComponent(epic.id)+'\\')">'+'<div class="epic-card-glow"></div><div class="eid">'+epic.id+'</div><h2>'+epic.title+'</h2><p>'+(epic.description||'').slice(0,140)+'</p><div class="epic-meta"><span><strong>'+epic.stories.length+'</strong> stories</span><span><strong>'+ds+'</strong> done</span></div><div class="epic-progress-bar"><div class="epic-progress-fill" style="width:'+Math.round(ds/Math.max(epic.stories.length,1)*100)+'%;background:'+progressColor(Math.round(ds/Math.max(epic.stories.length,1)*100))+'"></div></div></div>'}

// ── KANBAN ──────────────────────────
function renderEpicKanban(epic){
  const grouped={};COLUMNS.forEach(c=>grouped[c.key]=[]);
  epic.stories.forEach(s=>{const k=s.status||'todo';if(grouped[k])grouped[k].push(s);else grouped['todo'].push(s)});
  return '<div class="view"><a class="back-link" href="#/">← All Epics</a><div class="epic-title-row"><div class="eid-tag">'+epic.id+'</div><h1>'+epic.title+'</h1>'+(epic.description?'<p class="epic-desc">'+epic.description+'</p>':'')+'</div><div class="stats-row">'+stat(epic.stories.length,'Stories')+stat(epic.stories.filter(s=>s.status==='done').length+'/'+epic.stories.length,'Done')+'</div><div class="kanban">'+COLUMNS.map(col=>{const stories=grouped[col.key];return '<div class="kanban-col"><div class="kanban-col-header"><span class="dot" style="background:'+col.color+'"></span>'+col.label+'<span class="count">'+stories.length+'</span></div><div class="kanban-col-body" data-status="'+col.key+'">'+stories.map(s=>renderStoryCard(epic,s)).join('')+'</div></div>'}).join('')+'</div></div>'}
function renderStoryCard(epic,story){
  const tp=taskProgress(story);const colIdx=COL_KEYS.indexOf(story.status||'todo');
  const commits=storyCommits(story.id);const commitBadge=commits.length>0?' <span style="font-size:.6rem;color:var(--text-3)">'+commits.length+' commit'+(commits.length>1?'s':'')+'</span>':'';
  return '<div class="story-card" draggable="true" data-epic="'+epic.id+'" data-story="'+story.id+'" data-status="'+(story.status||'todo')+'">'+'<div class="arrow-row"><button class="arrow-btn" '+(colIdx>0?'onclick="arrowMove(event,\\''+epic.id+'\\',\\''+story.id+'\\',-1)"':'disabled')+'>◀</button><button class="arrow-btn" '+(colIdx<COL_KEYS.length-1?'onclick="arrowMove(event,\\''+epic.id+'\\',\\''+story.id+'\\',1)"':'disabled')+'>▶</button></div>'+'<div class="story-card-link" onclick="navigate(\\'#/epic/'+encodeURIComponent(epic.id)+'/story/'+encodeURIComponent(story.id)+'\\')">'+'<div class="sid">'+story.id+commitBadge+'</div><h3>'+story.title+'</h3>'+(tp.total>0?'<div class="story-ac-bar"><div class="bar-track"><div class="bar-fill" style="width:'+tp.pct+'%;background:'+progressColor(tp.pct)+'"></div></div><span class="bar-label">'+tp.done+'/'+tp.total+'</span></div>':'')+'</div></div>'}
async function arrowMove(event,epicId,storyId,dir){event.stopPropagation();const epic=PROJECT.epics.find(e=>e.id===epicId);const story=epic?.stories.find(s=>s.id===storyId);if(!story)return;const curIdx=COL_KEYS.indexOf(story.status||'todo');const newIdx=curIdx+dir;if(newIdx<0||newIdx>=COL_KEYS.length)return;if(await moveStory(epicId,storyId,COL_KEYS[newIdx]))route()}
async function onToggleAC(epicId,storyId,acIndex,newDone){if(await toggleAC(epicId,storyId,acIndex,newDone))route()}
async function onToggleTask(epicId,storyId,taskId,newDone){if(await toggleTaskFn(epicId,storyId,taskId,newDone))route()}
function setupDragAndDrop(epic){
  document.querySelectorAll('.story-card[draggable]').forEach(card=>{
    card.addEventListener('dragstart',e=>{card.classList.add('dragging');e.dataTransfer.setData('text/plain',card.dataset.epic+'|'+card.dataset.story);e.dataTransfer.effectAllowed='move'});
    card.addEventListener('dragend',()=>card.classList.remove('dragging'))});
  document.querySelectorAll('.kanban-col-body').forEach(zone=>{
    zone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';zone.classList.add('drag-over')});
    zone.addEventListener('dragleave',()=>zone.classList.remove('drag-over'));
    zone.addEventListener('drop',async e=>{e.preventDefault();zone.classList.remove('drag-over');const[epicId,storyId]=e.dataTransfer.getData('text/plain').split('|');const newStatus=zone.dataset.status;const story=epic.stories.find(s=>s.id===storyId);if(!story||story.status===newStatus)return;if(await moveStory(epicId,storyId,newStatus))route()})})}

// ── STORY DETAIL ────────────────────
function renderStoryDetail(epic,story){
  const tp=taskProgress(story);const ap=acProgress(story);
  const totalItems=tp.total+ap.total;const doneItems=(tp.total>0?tp.done:0)+(ap.total>0?ap.done:0);
  const pct=totalItems>0?Math.round(doneItems/totalItems*100):0;
  const commits=storyCommits(story.id);

  const metaItems=[{k:'Status',v:badgeHtml(story.status)},{k:'Priority',v:story.priority||'—'},{k:'Epic',v:epic.id+' — '+epic.title},{k:'Progress',v:doneItems+'/'+totalItems+' items'}];
  return '<div class="view story-detail">'+'<a class="back-link" href="#/epic/'+encodeURIComponent(epic.id)+'">← '+epic.id+' — '+epic.title+'</a>'+'<div class="sid-tag">Story '+story.id+'</div><h1>'+story.title+'</h1>'+'<div class="story-meta-grid">'+metaItems.map(m=>'<div class="meta-item"><div class="mk">'+m.k+'</div><div class="mv">'+m.v+'</div></div>').join('')+'</div>'+

  '<div class="progress-ring"><svg width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--bg-3)" stroke-width="4"/><circle cx="26" cy="26" r="22" fill="none" stroke="'+progressColor(pct)+'" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+(2*Math.PI*22)+'" stroke-dashoffset="'+(2*Math.PI*22*(1-pct/100))+'" transform="rotate(-90 26 26)" style="transition:stroke-dashoffset .5s ease"/></svg><div class="pr-text"><div class="pr-pct">'+pct+'%</div><div class="pr-label">completed</div></div></div>'+

  (story.description?'<div class="story-section"><h2>User Story</h2><div class="story-user-story">'+story.description+'</div></div>':'')+

  (story.acceptanceCriteria.length>0?'<div class="story-section"><h2>Acceptance Criteria</h2><table class="ac-table">'+story.acceptanceCriteria.map((ac,i)=>'<tr onclick="onToggleAC(\\''+epic.id+'\\',\\''+story.id+'\\','+(i+1)+','+!ac.done+')"><td class="ac-idx">'+(i+1)+'</td><td class="ac-status">'+(ac.done?'<span style="color:var(--done)">✓</span>':'<span style="color:var(--text-3)">○</span>')+'</td><td class="ac-text'+(ac.done?' is-done':'')+'">'+ac.description+'</td></tr>').join('')+'</table></div>':'')+

  (story.tasks.length>0?'<div class="story-section"><h2>Tasks ('+tp.done+'/'+tp.total+')</h2><ul class="task-list">'+story.tasks.map(t=>{
    const check=t.done?'<span style="color:var(--done)">✓</span>':'<span style="color:var(--text-3)">○</span>';
    let html='<li class="task-item" onclick="onToggleTask(\\''+epic.id+'\\',\\''+story.id+'\\',\\''+t.id+'\\','+!t.done+')"><span class="task-check">'+check+'</span><span class="task-text'+(t.done?' is-done':'')+'">'+t.description+'</span></li>';
    if(t.subtasks&&t.subtasks.length>0){
      html+='<li><div class="subtask-list">'+t.subtasks.map(s=>{
        const sc=s.done?'<span style="color:var(--done)">✓</span>':'<span style="color:var(--text-3)">○</span>';
        return '<div class="subtask-item" onclick="onToggleTask(\\''+epic.id+'\\',\\''+story.id+'\\',\\''+s.id+'\\','+!s.done+')" style="cursor:pointer"><span>'+sc+'</span><span class="'+(s.done?'is-done':'')+'">'+s.description+'</span></div>'
      }).join('')+'</div></li>'}
    return html}).join('')+'</ul></div>':'')+

  // ── Related Commits ──
  '<div class="story-section"><h2>Related Commits'+(commits.length>0?' ('+commits.length+')':'')+'</h2>'+
  (commits.length===0?'<p class="no-commits">No commits matched to this story'+(PROJECT.commits.length===0?' — run without --no-git to enable':'')+'</p>':
  '<ul class="commit-list">'+commits.map(c=>
    '<li class="commit-item"><span class="commit-sha">'+c.sha.slice(0,7)+'</span><div class="commit-body"><div class="commit-msg">'+c.message+'</div>'+(c.body?'<div class="commit-desc">'+c.body+'</div>':'')+'<div class="commit-meta"><span>'+new Date(c.date).toLocaleDateString()+'</span><span class="commit-score">'+Math.round(c.score*100)+'% match</span></div>'+(c.files&&c.files.length>0?'<details class="commit-files"><summary>'+c.files.length+' file'+(c.files.length>1?'s':'')+'</summary>'+c.files.join('<br>')+'</details>':'')+'</div></li>'
  ).join('')+'</ul>')+
  '</div>'+

  '</div>'}
</script>
</body>
</html>`;
}
