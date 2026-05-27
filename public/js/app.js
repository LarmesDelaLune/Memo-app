const P = (s) => document.getElementById(s);
const loginPage = P('loginPage');
const appPage = P('appPage');
const notesGrid = P('notesGrid');
const modalOverlay = P('modalOverlay');
const searchInput = P('searchInput');
const noteTitle = P('noteTitle');
const noteTags = P('noteTags');
const noteContent = P('noteContent');
const noteFolder = P('noteFolder');
const btnDelete = P('btnDelete');
const toastContainer = P('toastContainer');
const sidebar = P('sidebar');
const tagList = P('tagList');
const folderTree = P('folderTree');
const historyList = P('historyList');
const historyEmpty = P('historyEmpty');
const contextMenu = P('contextMenu');

let token = sessionStorage.getItem('memo_token');
let cachedNotes = [];
let currentUser = {
  username: sessionStorage.getItem('memo_username'),
  role: sessionStorage.getItem('memo_role'),
};
let editingId = null;
let adminViewAll = false;
let selectedTag = null;
let selectedNoteId = null;
let selectedFolderId = null;
let isFullscreen = false;
let ctxFolderId = null;
let foldersData = [];
let previewMode = 0; // 0=编辑, 1=预览
let dragNoteId = null; // 拖拽中的笔记ID

// ---------- Toast ----------
function toast(msg, type) {
  type = type || 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  el.innerHTML = `<span>${icons[type] || ''}</span> ${msg}`;
  toastContainer.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2500);
  setTimeout(() => el.remove(), 3000);
}

// ---------- 初始化 ----------
if (token && currentUser.username) { showApp(); loadNotes(); loadTags(); loadFolders(); }

// ---------- 登录 ----------
P('loginBtn').onclick = async () => {
  const username = P('usernameInput').value.trim();
  const pw = P('passwordInput').value;
  if (!username || !pw) { P('loginError').style.display = 'block'; return; }
  try {
    const res = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pw })
    });
    if (!res.ok) throw new Error();
    const data = await res.json();
    token = data.token;
    currentUser = { username: data.username, role: data.role };
    sessionStorage.setItem('memo_token', token);
    sessionStorage.setItem('memo_username', data.username);
    sessionStorage.setItem('memo_role', data.role);
    P('loginError').style.display = 'none';
    showApp();
    loadNotes();
    loadTags();
    loadFolders();
  } catch { P('loginError').style.display = 'block'; }
};
P('passwordInput').onkeydown = (e) => { if (e.key === 'Enter') P('loginBtn').click(); };
P('usernameInput').onkeydown = (e) => { if (e.key === 'Enter') P('passwordInput').focus(); };

// ---------- 退出 ----------
P('logoutBtn').onclick = async () => {
  await fetch('/api/logout', { method: 'POST', headers: authHeaders() });
  clearSession();
};

// ---------- 辅助 ----------
function authHeaders() {
  return token ? { 'Authorization': token, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}
function showApp() {
  loginPage.classList.remove('active');
  appPage.classList.add('active');
  P('userDisplay').innerHTML = `${escHtml(currentUser.username)} <span class="role-badge">${currentUser.role === 'admin' ? 'Admin' : 'User'}</span>`;
  if (currentUser.role === 'admin') { P('btnAdmin').style.display = ''; P('adminViewToggle').style.display = ''; }
  else { P('btnAdmin').style.display = 'none'; P('adminViewToggle').style.display = 'none'; }
}
function clearSession() {
  sessionStorage.removeItem('memo_token'); sessionStorage.removeItem('memo_username'); sessionStorage.removeItem('memo_role');
  token = null; currentUser = {}; adminViewAll = false; selectedTag = null; selectedNoteId = null; selectedFolderId = null; foldersData = [];
  P('chkAllNotes').checked = false;
  loginPage.classList.add('active'); appPage.classList.remove('active');
}
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function renderMarkdown(text) {
  if (typeof marked === 'undefined') return escHtml(text);
  marked.setOptions({ breaks: true });
  const html = marked.parse(text || '');
  // highlight.js
  if (typeof hljs !== 'undefined') {
    const el = document.createElement('div');
    el.innerHTML = html;
    el.querySelectorAll('pre code').forEach((block) => hljs.highlightElement(block));
    return el.innerHTML;
  }
  return html;
}

// ---------- 侧边栏 ----------
P('btnSidebarToggle').onclick = () => sidebar.classList.toggle('open');
document.querySelector('.main').addEventListener('click', () => sidebar.classList.remove('open'));

async function loadTags() {
  try {
    const res = await fetch('/api/tags', { headers: authHeaders() });
    const tags = await res.json();
    renderTags(tags);
  } catch {}
}

function renderTags(tags) {
  P('tagCount').textContent = tags.length;
  let html = '';
  tags.forEach((t) => {
    html += `<div class="tag-item${selectedTag === t.name ? ' active' : ''}" data-tag="${escHtml(t.name)}">
      <span>${escHtml(t.name)}</span><span class="count">${t.count}</span>
    </div>`;
  });
  tagList.innerHTML = html;
  tagList.querySelectorAll('.tag-item').forEach((el) => {
    el.onclick = () => {
      sidebar.classList.remove('open');
      const tag = el.dataset.tag;
      if (selectedTag === tag) { selectedTag = null; }
      else { selectedTag = tag; }
      selectedFolderId = null; selectedNoteId = null;
      loadFolders();
      renderTags(tags);
      P('btnAllNotes').classList.remove('active');
      if (selectedTag) { P('tagFilterHint').style.display = ''; P('tagFilterLabel').textContent = selectedTag; }
      else P('tagFilterHint').style.display = 'none';
      loadNotes();
      clearHistoryPanel();
    };
  });
}

P('btnAllNotes').onclick = () => {
  sidebar.classList.remove('open');
  selectedTag = null; selectedNoteId = null; selectedFolderId = null;
  P('btnAllNotes').classList.add('active');
  P('tagFilterHint').style.display = 'none';
  loadTags();
  loadNotes();
  loadFolders();
  clearHistoryPanel();
};

P('clearTagFilter').onclick = (e) => { e.stopPropagation(); P('btnAllNotes').click(); };

// ---------- 目录功能 ----------

async function loadFolders() {
  try {
    const all = adminViewAll && currentUser.role === 'admin';
    const url = '/api/folders' + (all ? '?all=true' : '');
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json();
    foldersData = data.byUser || data.tree;
    if (data.byUser) {
      renderUserFolderTree(data.byUser);
      P('uncategorizedCount').textContent = '';
    } else {
      renderFolderTree(data.tree);
      P('uncategorizedCount').textContent = `(${data.uncategorizedCount})`;
    }
    populateFolderSelect(data.tree);
  } catch {}
}

let folderDropTarget = null;

function renderUserFolderTree(byUser) {
  let html = '';
  byUser.forEach((u) => {
    html += `<div style="padding:4px 0;font-size:12px;font-weight:600;color:var(--primary);margin-top:4px">👤 ${escHtml(u.username)}</div>`;
    if (u.tree.length) {
      html += u.tree.map((f) => renderFolderRow(f, 0)).join('');
    } else {
      html += `<div style="font-size:11px;color:#aaa;padding:2px 8px">无目录</div>`;
    }
    html += `<div class="btn-all-notes" style="font-weight:400;font-size:11px;margin-left:4px;color:var(--text-secondary)" data-userid="${u.userId}" data-uncategorized>未分类 (${u.uncategorizedCount})</div>`;
  });
  folderTree.innerHTML = html;

  // 绑定点击
  folderTree.querySelectorAll('.folder-row').forEach((row) => {
    row.onclick = (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('arrow') && !e.target.classList.contains('hidden')) return;
      selectFolder(row.dataset.id);
      sidebar.classList.remove('open');
    };
    const arrow = row.querySelector('.arrow');
    if (arrow && !arrow.classList.contains('hidden')) {
      arrow.onclick = (e) => {
        e.stopPropagation();
        const children = row.parentElement.querySelector('.folder-children');
        if (children) {
          children.style.display = children.style.display === 'none' ? '' : 'none';
          arrow.classList.toggle('open');
        }
      };
    }
  });

  // "未分类"点击 → 筛选该用户未分类笔记
  folderTree.querySelectorAll('[data-uncategorized]').forEach((el) => {
    el.onclick = () => {
      selectedFolderId = '__uncategorized__';
      selectedTag = null; selectedNoteId = null;
      P('btnAllNotes').classList.remove('active');
      P('tagFilterHint').style.display = 'none';
      // 存储当前查看的用户ID用于筛选
      if (adminViewAll) sessionStorage.setItem('memo_view_user', el.dataset.userid);
      loadNotes();
      sidebar.classList.remove('open');
    };
    // 拖放支持
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.style.background = 'var(--primary-light)'; });
    el.addEventListener('dragleave', () => { el.style.background = ''; });
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      el.style.background = '';
      const nid = dragNoteId; dragNoteId = null;
      if (!nid) return;
      try {
        await fetch(`/api/notes/${nid}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ folderId: null }) });
        await loadNotes(); await loadFolders();
        toast('已移出目录', 'success');
      } catch { toast('移动失败', 'error'); }
    });
  });

  if (selectedFolderId) expandToFolder(selectedFolderId);
}

function renderFolderTree(tree) {
  folderTree.innerHTML = tree.map((f) => renderFolderRow(f, 0)).join('');
  if (selectedFolderId) expandToFolder(selectedFolderId);
}

// 目录树事件委托
folderTree.addEventListener('click', (e) => {
  const row = e.target.closest('.folder-row');
  if (!row) return;
  // 箭头折叠
  const arrow = row.querySelector('.arrow');
  if (arrow && e.target === arrow && !arrow.classList.contains('hidden')) {
    const children = row.parentElement.querySelector('.folder-children');
    if (children) {
      children.style.display = children.style.display === 'none' ? '' : 'none';
      arrow.classList.toggle('open');
    }
    return;
  }
  selectFolder(row.dataset.id);
  sidebar.classList.remove('open');
});

folderTree.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.folder-row');
  if (row) { e.preventDefault(); openFolderContext(e, row.dataset.id); }
});

folderTree.addEventListener('dragover', (e) => {
  const row = e.target.closest('.folder-row');
  if (!row) return;
  e.preventDefault();
  if (folderDropTarget && folderDropTarget !== row) {
    folderDropTarget.classList.remove('drag-over');
  }
  row.classList.add('drag-over');
  folderDropTarget = row;
});

folderTree.addEventListener('dragleave', (e) => {
  const row = e.target.closest('.folder-row');
  if (row === folderDropTarget && !row.contains(e.relatedTarget)) {
    row.classList.remove('drag-over');
    folderDropTarget = null;
  }
});

folderTree.addEventListener('drop', async (e) => {
  e.preventDefault();
  if (folderDropTarget) folderDropTarget.classList.remove('drag-over');
  const row = e.target.closest('.folder-row');
  folderDropTarget = null;
  if (!row) return;
  const noteId = dragNoteId;
  dragNoteId = null;
  if (!noteId) return;
  try {
    await fetch(`/api/notes/${noteId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ folderId: row.dataset.id })
    });
    await loadNotes();
    await loadFolders();
    toast('已移动到目录', 'success');
  } catch { toast('移动失败', 'error'); }
});

function renderFolderRow(f, depth) {
  const hasChildren = f.children && f.children.length > 0;
  const arrowClass = hasChildren ? '' : 'hidden';
  const activeClass = selectedFolderId === f.id ? ' active' : '';
  const children = hasChildren ? `<div class="folder-children">${f.children.map((c) => renderFolderRow(c, depth + 1)).join('')}</div>` : '';
  return `<div class="folder-row${activeClass}" data-id="${f.id}" style="padding-left:${4 + depth * 16}px">
    <span class="arrow${hasChildren ? '' : ' hidden'}">▶</span>
    <span class="folder-icon">📁</span>
    <span class="folder-name">${escHtml(f.name)}</span>
    <span class="badge">${f.noteCount}</span>
  </div>${children}`;
}

function selectFolder(id) {
  if (selectedFolderId === id) { selectedFolderId = null; }
  else { selectedFolderId = id; }
  selectedTag = null; selectedNoteId = null;
  P('btnAllNotes').classList.remove('active');
  P('tagFilterHint').style.display = 'none';
  loadNotes(); loadFolders(); loadTags(); clearHistoryPanel();
}

function expandToFolder(id) {
  const row = folderTree.querySelector(`.folder-row[data-id="${id}"]`);
  if (!row) return;
  let parent = row.parentElement;
  while (parent && parent !== folderTree) {
    if (parent.classList.contains('folder-children')) {
      parent.style.display = '';
      const prev = parent.previousElementSibling;
      if (prev) {
        const arrow = prev.querySelector('.arrow');
        if (arrow) arrow.classList.add('open');
      }
    }
    parent = parent.parentElement;
  }
}

function flattenFolderTree(tree) {
  let result = [];
  function walk(nodes) {
    nodes.forEach((f) => { result.push(f); if (f.children) walk(f.children); });
  }
  walk(tree);
  return result;
}

function collectDescendantIds(folderId, tree) {
  if (!tree || !tree.length) return [folderId];
  // 兼容分组格式 (byUser): 用户对象有 .tree，文件夹对象没有
  const flat = (tree[0] && tree[0].tree) ? flattenFolderTree(tree.flatMap((u) => u.tree)) : tree;
  let ids = [folderId];
  for (const f of flat) {
    if (f.id === folderId) {
      function walk(node) { ids.push(node.id); (node.children || []).forEach(walk); }
      (f.children || []).forEach(walk);
      break;
    }
  }
  return ids;
}

function populateFolderSelect(tree, depth) {
  if (depth === undefined) {
    noteFolder.innerHTML = '<option value="">（未分类）</option>';
    depth = 0;
  }
  tree.forEach((f) => {
    const indent = '　'.repeat(depth);
    noteFolder.innerHTML += `<option value="${f.id}" style="padding-left:${8 + depth * 12}px">${indent}${escHtml(f.name)}</option>`;
    if (f.children && f.children.length) populateFolderSelect(f.children, depth + 1);
  });
}

function openFolderContext(e, folderId) {
  ctxFolderId = folderId;
  contextMenu.style.display = 'block';
  contextMenu.style.left = e.clientX + 'px';
  contextMenu.style.top = e.clientY + 'px';
}

document.addEventListener('click', () => { contextMenu.style.display = 'none'; });

P('btnAddRootFolder').onclick = () => {
  const name = prompt('新目录名称:');
  if (!name || !name.trim()) return;
  createFolder(name.trim(), null);
};

contextMenu.querySelectorAll('.ctx-item').forEach((item) => {
  item.onclick = () => {
    const action = item.dataset.action;
    if (action === 'new-folder') {
      const name = prompt('子目录名称:');
      if (name && name.trim()) createFolder(name.trim(), ctxFolderId);
    } else if (action === 'rename') {
      const name = prompt('新名称:');
      if (name && name.trim()) renameFolder(ctxFolderId, name.trim());
    } else if (action === 'delete-folder') {
      if (confirm('确定删除此目录及其所有子目录？笔记将被移入"未分类"。')) deleteFolder(ctxFolderId);
    }
    contextMenu.style.display = 'none';
  };
});

async function createFolder(name, parentId) {
  try {
    await fetch('/api/folders', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, parentId })
    });
    loadFolders();
  } catch {}
}

async function renameFolder(id, name) {
  try {
    await fetch(`/api/folders/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ name })
    });
    loadFolders();
  } catch {}
}

async function deleteFolder(id) {
  try {
    await fetch(`/api/folders/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (selectedFolderId === id) { selectedFolderId = null; loadNotes(); }
    loadFolders();
  } catch {}
}

P('btnUncategorized').onclick = () => {
  selectedFolderId = '__uncategorized__';
  selectedTag = null; selectedNoteId = null;
  P('btnAllNotes').classList.remove('active');
  P('tagFilterHint').style.display = 'none';
  loadNotes(); loadFolders(); clearHistoryPanel();
  sidebar.classList.remove('open');
};

// 未分类区域也接受拖放
const btnUncategorized = P('btnUncategorized');
btnUncategorized.addEventListener('dragover', (e) => { e.preventDefault(); btnUncategorized.style.background = 'var(--primary-light)'; });
btnUncategorized.addEventListener('dragleave', () => { btnUncategorized.style.background = ''; });
btnUncategorized.addEventListener('drop', async (e) => {
  e.preventDefault();
  btnUncategorized.style.background = '';
  const noteId = dragNoteId;
  dragNoteId = null;
  if (!noteId) return;
  try {
    await fetch(`/api/notes/${noteId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ folderId: null })
    });
    await loadNotes();
    await loadFolders();
    toast('已移出目录', 'success');
  } catch { toast('移动失败', 'error'); }
});

// ---------- 历史面板 ----------
async function loadHistory(noteId) {
  try {
    const res = await fetch(`/api/notes/${noteId}/history`, { headers: authHeaders() });
    const history = await res.json();
    renderHistory(history);
  } catch { historyList.innerHTML = ''; }
}

function renderHistory(history) {
  if (!history.length) {
    historyEmpty.style.display = ''; historyList.innerHTML = '';
    return;
  }
  historyEmpty.style.display = 'none';
  historyList.innerHTML = history.map((h) => {
    const time = new Date(h.savedAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
    return `<div class="history-item" data-hid="${h.id}">
      <span>${escHtml(h.title)}</span>
      <span class="h-time">${time}</span>
    </div>`;
  }).join('');
  historyList.querySelectorAll('.history-item').forEach((el) => {
    el.onclick = () => openHistoryPreview(el.dataset.hid);
  });
}

function clearHistoryPanel() {
  selectedNoteId = null;
  historyEmpty.style.display = ''; historyList.innerHTML = '';
  document.querySelectorAll('.note-card.selected').forEach((c) => c.classList.remove('selected'));
}

// ---------- 历史预览 / 恢复 ----------
let restoreHistoryId = null;
let restoreNoteId = null;

function openHistoryPreview(historyId) {
  restoreHistoryId = historyId;
  restoreNoteId = selectedNoteId;
  P('historyModalOverlay').classList.add('active');
  // 加载历史详情
  fetch(`/api/notes/${restoreNoteId}/history`, { headers: authHeaders() }).then((r) => r.json()).then((list) => {
    const h = list.find((e) => e.id === historyId);
    if (h) {
      P('hpTitle').textContent = h.title;
      P('hpContent').textContent = h.content;
      P('hpTime').textContent = new Date(h.savedAt).toLocaleString('zh-CN');
    }
  });
}

P('btnHistoryClose').onclick = () => P('historyModalOverlay').classList.remove('active');
P('historyModalOverlay').onclick = (e) => { if (e.target === P('historyModalOverlay')) P('historyModalOverlay').classList.remove('active'); };

P('btnRestore').onclick = async () => {
  if (!restoreNoteId || !restoreHistoryId || !confirm('确定恢复到这个历史版本吗？当前内容将被保存为一个新版本。')) return;
  try {
    const res = await fetch(`/api/notes/${restoreNoteId}/restore/${restoreHistoryId}`, { method: 'POST', headers: authHeaders() });
    if (!res.ok) throw new Error();
    P('historyModalOverlay').classList.remove('active');
    loadNotes();
    loadTags();
    if (selectedNoteId) loadHistory(selectedNoteId);
    toast('已恢复到历史版本', 'success');
  } catch { toast('恢复失败', 'error'); }
};

// ---------- 加载笔记 ----------
async function loadNotes() {
  let url = '/api/notes';
  const params = [];
  const q = searchInput.value.trim();
  if (q) params.push(`q=${encodeURIComponent(q)}`);
  if (adminViewAll && currentUser.role === 'admin') params.push('all=true');
  if (params.length) url += '?' + params.join('&');
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (res.status === 401) { clearSession(); return; }
    let notes = await res.json();
    // 标签筛选
    if (selectedTag) notes = notes.filter((n) => (n.tags || []).includes(selectedTag));
    // 目录筛选（包含子目录）
    if (selectedFolderId === '__uncategorized__') notes = notes.filter((n) => !n.folderId);
    else if (selectedFolderId) {
      const allFolderIds = collectDescendantIds(selectedFolderId, foldersData);
      notes = notes.filter((n) => allFolderIds.includes(n.folderId));
    }
    // 排序：置顶优先，然后按选择的排序
    const sortEl = P('sortSelect');
    const sort = sortEl ? sortEl.value : 'updated-desc';
    const [skey, sdir] = sort.split('-');
    notes.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      let va, vb;
      if (skey === 'title') { va = a.title || ''; vb = b.title || ''; }
      else if (skey === 'created') { va = a.createdAt || ''; vb = b.createdAt || ''; }
      else { va = a.updatedAt || ''; vb = b.updatedAt || ''; }
      const cmp = skey === 'title' ? va.localeCompare(vb, 'zh') : va.localeCompare(vb);
      return sdir === 'asc' ? cmp : -cmp;
    });
    renderNotes(notes);
  } catch (e) { console.error(e); notesGrid.innerHTML = `<div class="empty-state"><p>加载失败</p><p style="font-size:11px;color:var(--danger);margin-top:4px;white-space:pre-wrap">${escHtml(e.message || String(e))}\n\n${escHtml(e.stack || '')}</p></div>`; }
}

function renderNotes(notes) {
  cachedNotes = notes;
  if (!notes.length) {
    notesGrid.innerHTML = `<div class="empty-state">
      <div class="icon">&#x1F4DD;</div>
      <h3>${selectedTag ? `没有带"${escHtml(selectedTag)}"标签的笔记` : '还没有笔记'}</h3>
      <p>点击"+ 新建笔记"开始记录</p></div>`;
    return;
  }
  notesGrid.innerHTML = notes.map((n, i) => {
    const preview = n.snippet || (n.content ? renderMarkdown(n.content.slice(0, 200)) : '');
    const time = new Date(n.updatedAt).toLocaleString('zh-CN', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
    const ownerTag = n.username && n.username !== currentUser.username ? `<div class="note-owner">${escHtml(n.username)}</div>` : '';
    const pinIcon = n.pinned ? '📌' : '';
    const tagBadges = (n.tags || []).map((t) => `<span class="note-tag">${escHtml(t)}</span>`).join('');
    return `<div class="note-card${selectedNoteId === n.id ? ' selected' : ''}${n.pinned ? ' pinned' : ''}" data-id="${n.id}" style="animation-delay:${i*.04}s" draggable="true">
        <h3>${pinIcon} ${escHtml(n.title)}</h3>
        ${ownerTag}
        ${tagBadges ? `<div class="note-tags">${tagBadges}</div>` : ''}
        <div class="preview">${preview || '（无内容）'}</div>
        <div class="meta"><span>${time}</span><div><button class="btn-pin" data-action="pin">📌</button><button class="btn-del" data-action="delete">删除</button></div></div>
      </div>`;
  }).join('');

  notesGrid.querySelectorAll('.note-card').forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.dataset.action === 'delete') { e.stopPropagation(); deleteNote(card.dataset.id); return; }
      if (e.target.dataset.action === 'pin') { e.stopPropagation(); togglePin(card.dataset.id); return; }
      selectNote(card.dataset.id);
    });
    // 拖拽
    card.addEventListener('dragstart', (e) => {
      dragNoteId = card.dataset.id;
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

function selectNote(id) {
  selectedNoteId = id;
  sidebar.classList.remove('open');
  document.querySelectorAll('.note-card.selected').forEach((c) => c.classList.remove('selected'));
  const card = document.querySelector(`.note-card[data-id="${id}"]`);
  if (card) card.classList.add('selected');
  loadHistory(id);
  openModal(id);
}

// ---------- 新建 / 编辑 ----------
P('btnNew').onclick = () => { sidebar.classList.remove('open'); openModal(); };

// 文件导入
P('btnImport').onclick = () => P('fileInput').click();
P('fileInput').onchange = async () => {
  const files = [...P('fileInput').files];
  P('fileInput').value = '';
  let imported = 0, failed = 0;
  for (const f of files) {
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(f);
      });

      if (!text || !text.trim()) { failed++; continue; }

      const ext = f.name.split('.').pop().toLowerCase();
      if (ext === 'json') {
        const data = JSON.parse(text);
        const noteList = data.notes || (Array.isArray(data) ? data : [data]);
        for (const item of noteList) {
          if (!item.title) continue;
          const res = await fetch('/api/notes', {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ title: String(item.title), content: String(item.content || ''), tags: (item.tags || []), folderId: item.folderId || null })
          });
          if (res.ok) imported++; else failed++;
        }
      } else {
        const title = f.name.replace(/\.(md|txt)$/i, '');
        const res = await fetch('/api/notes', {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ title, content: text, tags: [], folderId: null })
        });
        if (res.ok) imported++; else failed++;
      }
    } catch (e) {
      failed++;
    }
  }
  if (imported > 0 || failed > 0) { loadNotes(); loadTags(); loadFolders(); }
  if (imported > 0) toast(`已导入 ${imported} 条笔记`, 'success');
  if (failed > 0) toast(`${failed} 条导入失败（可能内容过大或格式错误）`, 'error');
};

searchInput.oninput = () => loadNotes();
P('chkAllNotes').onchange = function() { adminViewAll = this.checked; loadNotes(); };
const sortEl = P('sortSelect');
if (sortEl) sortEl.onchange = () => loadNotes();

function openModal(id) {
  editingId = id || null;
  if (id) {
    P('modalTitle').textContent = '编辑笔记';
    btnDelete.style.display = '';
    loadNoteFromCache(id);
  } else {
    P('modalTitle').textContent = '新建笔记';
    btnDelete.style.display = 'none';
    noteTitle.value = '';
    noteFolder.value = '';
    noteTags.value = '';
    noteContent.value = '';
  }
  previewMode = 0;
  P('btnPreviewToggle').textContent = '预览';
  P('noteContent').style.display = '';
  P('notePreview').style.display = 'none';
  modalOverlay.classList.add('active');
  noteTitle.focus();
}

async function loadNoteFromCache(id) {
  let note = cachedNotes.find((n) => n.id === id);
  // 从服务器获取完整内容
  try {
    const res = await fetch(`/api/notes/${id}`, { headers: authHeaders() });
    if (res.ok) note = await res.json();
  } catch {}
  if (note) {
    noteTitle.value = note.title;
    noteFolder.value = note.folderId || '';
    noteTags.value = (note.tags || []).join(', ');
    noteContent.value = note.content || '';
  }
}

P('btnCancel').onclick = closeModal;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };

function closeModal() {
  modalOverlay.classList.remove('active');
  document.querySelector('#modalOverlay .modal').classList.remove('fullscreen');
  isFullscreen = false;
  P('btnExpand').textContent = '⛶';
  editingId = null;
}

P('btnExpand').onclick = (e) => {
  e.stopPropagation();
  isFullscreen = !isFullscreen;
  document.querySelector('#modalOverlay .modal').classList.toggle('fullscreen', isFullscreen);
  P('btnExpand').textContent = isFullscreen ? '✕' : '⛶';
};

// Markdown 预览切换: 编辑 ↔ 预览
P('btnPreviewToggle').onclick = (e) => {
  e.stopPropagation();
  previewMode = previewMode === 0 ? 1 : 0;
  const textarea = P('noteContent');
  const preview = P('notePreview');
  const btn = P('btnPreviewToggle');

  if (previewMode === 0) {
    btn.textContent = '预览';
    textarea.style.display = '';
    preview.style.display = 'none';
  } else {
    btn.textContent = '编辑';
    textarea.style.display = 'none';
    preview.style.display = '';
    preview.innerHTML = renderMarkdown(textarea.value) || '<span style="color:#999">（无内容）</span>';
  }
};

P('btnSave').onclick = async () => {
  const title = noteTitle.value.trim();
  if (!title) { noteTitle.focus(); return; }
  const content = noteContent.value.trim();
  const rawTags = noteTags.value.trim();
  const tags = rawTags ? rawTags.split(/[,，]/).map((t) => t.trim()).filter(Boolean) : [];
  const folderId = noteFolder.value || null;
  const method = editingId ? 'PUT' : 'POST';
  const url = editingId ? `/api/notes/${editingId}` : '/api/notes';
  try {
    const res = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify({ title, content, tags, folderId }) });
    if (!res.ok) throw new Error();
    closeModal();
    loadNotes();
    loadTags();
    loadFolders();
    if (selectedNoteId) loadHistory(selectedNoteId);
    toast(editingId ? '笔记已保存' : '笔记已创建', 'success');
  } catch { toast('保存失败', 'error'); }
};

btnDelete.onclick = async () => {
  if (!editingId || !confirm('确定删除这条笔记吗？')) return;
  try {
    await fetch(`/api/notes/${editingId}`, { method: 'DELETE', headers: authHeaders() });
    closeModal();
    if (selectedNoteId === editingId) clearHistoryPanel();
    loadNotes();
    loadTags();
    loadFolders();
    toast('笔记已删除', 'success');
  } catch { toast('删除失败', 'error'); }
};

async function togglePin(id) {
  const note = cachedNotes.find((n) => n.id === id);
  if (!note) return;
  try {
    await fetch(`/api/notes/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ pinned: !note.pinned })
    });
    loadNotes();
  } catch {}
}

async function deleteNote(id) {
  if (!confirm('确定删除这条笔记吗？')) return;
  try {
    await fetch(`/api/notes/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (selectedNoteId === id) clearHistoryPanel();
    loadNotes();
    loadTags();
    loadFolders();
    toast('笔记已删除', 'success');
  } catch { toast('删除失败', 'error'); }
}

// ---------- 管理员面板 ----------
P('btnAdmin').onclick = openAdminPanel;
P('btnAdminClose').onclick = closeAdminPanel;
P('adminModalOverlay').onclick = (e) => { if (e.target === P('adminModalOverlay')) closeAdminPanel(); };
async function openAdminPanel() { P('adminModalOverlay').classList.add('active'); await loadUsers(); }
function closeAdminPanel() { P('adminModalOverlay').classList.remove('active'); }
async function loadUsers() {
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    renderUserTable(await res.json());
  } catch { P('adminUserTable').innerHTML = '<p style="color:var(--danger);font-size:13px">加载失败</p>'; }
}
function renderUserTable(users) {
  const rows = users.map((u) => `
    <tr><td>${escHtml(u.username)}</td><td>${u.role==='admin'?'管理员':'用户'}</td><td>${new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
    <td><button class="btn-sm" onclick="resetPassword('${u.id}','${escHtml(u.username)}')">重置密码</button>
    ${u.id!==currentUser.username?`<button class="btn-sm danger" onclick="deleteUser('${u.id}','${escHtml(u.username)}')">删除</button>`:''}</td></tr>`).join('');
  P('adminUserTable').innerHTML = `<table class="user-table"><thead><tr><th>用户名</th><th>角色</th><th>创建时间</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table>`;
}
async function createUser(username, password) {
  try {
    const res = await fetch('/api/admin/users', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ username, password }) });
    if (!res.ok) { const d=await res.json(); P('adminError').textContent=d.error; P('adminError').style.display='block'; return; }
    P('adminError').style.display='none'; P('newUsername').value=''; P('newPassword').value=''; loadUsers();
    toast(`用户 "${username}" 已创建`, 'success');
  } catch {}
}
P('btnCreateUser').onclick = () => {
  const u=P('newUsername').value.trim(), p=P('newPassword').value;
  if(!u||!p||p.length<4){P('adminError').textContent='用户名不能为空，密码至少4位';P('adminError').style.display='block';return;}
  createUser(u,p);
};
async function resetPassword(userId, username) {
  const np = prompt(`为 "${username}" 设置新密码（至少4位）`);
  if (!np || np.length<4) return;
  try {
    await fetch(`/api/admin/users/${userId}`,{method:'PUT',headers:authHeaders(),body:JSON.stringify({password:np})});
    toast(`密码已重置`,'success');
  } catch { toast('重置失败','error'); }
}
async function deleteUser(userId, username) {
  if (!confirm(`确定删除用户 "${username}" 及其所有笔记吗？`)) return;
  try {
    await fetch(`/api/admin/users/${userId}`,{method:'DELETE',headers:authHeaders()});
    loadUsers(); loadNotes(); loadTags(); loadFolders();
    toast(`用户已删除`,'success');
  } catch { toast('删除失败','error'); }
}

document.onkeydown = (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape') {
    if (modalOverlay.classList.contains('active')) closeModal();
    else if (P('historyModalOverlay').classList.contains('active')) P('historyModalOverlay').classList.remove('active');
    else if (P('adminModalOverlay').classList.contains('active')) closeAdminPanel();
    return;
  }
  if (mod && e.key === 'n') { e.preventDefault(); openModal(); }          // Ctrl+N 新建
  if (mod && e.key === 's') { e.preventDefault(); P('btnSave').click(); } // Ctrl+S 保存
  if (mod && e.key === 'k') { e.preventDefault(); searchInput.focus(); searchInput.select(); } // Ctrl+K 搜索
};

// 主题切换
function getTheme() {
  const stored = localStorage.getItem('memo_theme');
  if (stored) return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(theme) {
  document.documentElement.removeAttribute('data-theme');
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else if (theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  localStorage.setItem('memo_theme', theme);
}
applyTheme(getTheme());
P('btnTheme').onclick = () => {
  const cur = getTheme();
  applyTheme(cur === 'dark' ? 'light' : 'dark');
};

// 导出
P('btnExport').onclick = () => {
  const scopeCurrent = P('exportScopeCurrent');
  const scopeAll = P('exportScopeAll');
  if (selectedNoteId) {
    scopeCurrent.disabled = false;
    scopeCurrent.textContent = '当前选中的笔记';
    scopeCurrent.value = selectedNoteId;
  } else {
    scopeCurrent.disabled = true;
    scopeCurrent.textContent = '当前选中的笔记（请先选中一条笔记）';
    scopeCurrent.value = 'current';
  }
  if (currentUser.role === 'admin') {
    scopeAll.style.display = '';
  } else {
    scopeAll.style.display = 'none';
  }
  P('exportModalOverlay').classList.add('active');
};

P('btnExportCancel').onclick = () => P('exportModalOverlay').classList.remove('active');
P('exportModalOverlay').onclick = (e) => {
  if (e.target === P('exportModalOverlay')) P('exportModalOverlay').classList.remove('active');
};

P('btnExportConfirm').onclick = async () => {
  const format = P('exportFormat').value;
  const scope = P('exportScope').value;
  let url = `/api/export?format=${format}`;
  if (scope === 'all') {
    url += '&all=true';
  } else if (scope !== 'my') {
    url += `&noteId=${encodeURIComponent(scope)}`;
  }
  try {
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename\*?=UTF-8''(.+)/);
    const filename = match ? decodeURIComponent(match[1]) : `memo-export.${format}`;
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl; a.download = filename; a.click();
    URL.revokeObjectURL(objUrl);
    P('exportModalOverlay').classList.remove('active');
    toast('数据已导出', 'success');
  } catch { toast('导出失败', 'error'); }
};

// 注册 Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}