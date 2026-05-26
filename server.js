const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const NOTES_FILE = path.join(__dirname, 'data', 'notes.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const HISTORY_FILE = path.join(__dirname, 'data', 'history.json');
const FOLDERS_FILE = path.join(__dirname, 'data', 'folders.json');
const MAX_HISTORY = 10;

fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 密码工具 ----------

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return hash === verify;
}

// ---------- 用户存储 ----------

function readUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      const adminUser = {
        id: uuidv4(),
        username: ADMIN_USERNAME,
        password: hashPassword(ADMIN_PASSWORD),
        role: 'admin',
        createdAt: new Date().toISOString(),
      };
      writeUsers([adminUser]);
      return [adminUser];
    }
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

// ---------- 笔记存储 ----------

function readNotes() {
  try {
    if (!fs.existsSync(NOTES_FILE)) {
      fs.writeFileSync(NOTES_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeNotes(notes) {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2), 'utf-8');
}

// ---------- 历史存储 ----------

function readHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) {
      fs.writeFileSync(HISTORY_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeHistory(history) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

function saveHistorySnapshot(note, savedBy) {
  const history = readHistory();
  history.push({
    id: uuidv4(),
    noteId: note.id,
    title: note.title,
    content: note.content,
    tags: note.tags || [],
    folderId: note.folderId || null,
    savedAt: new Date().toISOString(),
    savedBy,
  });
  // 每笔记最多保留 MAX_HISTORY 条
  const noteHistory = history.filter((h) => h.noteId === note.id);
  if (noteHistory.length > MAX_HISTORY) {
    const toRemove = noteHistory.slice(0, noteHistory.length - MAX_HISTORY).map((h) => h.id);
    return history.filter((h) => !toRemove.includes(h.id));
  }
  return history;
}

// ---------- 目录存储 ----------

function readFolders() {
  try {
    if (!fs.existsSync(FOLDERS_FILE)) {
      fs.writeFileSync(FOLDERS_FILE, '[]', 'utf-8');
      return [];
    }
    return JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeFolders(folders) {
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify(folders, null, 2), 'utf-8');
}

function buildFolderTree(folders, parentId, notes) {
  return folders
    .filter((f) => f.parentId === parentId)
    .map((f) => ({
      ...f,
      children: buildFolderTree(folders, f.id, notes),
      noteCount: notes.filter((n) => n.folderId === f.id).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

// ---------- 认证 ----------

const tokenUserMap = new Map();

function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  if (!token || !tokenUserMap.has(token)) {
    return res.status(401).json({ error: '未登录或登录已过期' });
  }
  req.user = tokenUserMap.get(token);
  next();
}

function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }
  const users = readUsers();
  const user = users.find((u) => u.username === username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(403).json({ error: '用户名或密码错误' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  tokenUserMap.set(token, { id: user.id, username: user.username, role: user.role });
  res.json({ token, username: user.username, role: user.role });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  tokenUserMap.delete(req.headers.authorization);
  res.json({ ok: true });
});

// ---------- 笔记 API ----------

app.get('/api/notes', authMiddleware, (req, res) => {
  const notes = readNotes();
  const all = req.query.all === 'true' && req.user.role === 'admin';
  let result;
  if (all) {
    const users = readUsers();
    const userMap = {};
    users.forEach((u) => { userMap[u.id] = u.username; });
    result = notes.map((n) => ({ ...n, username: userMap[n.userId] || '未知' }));
  } else {
    result = notes.filter((n) => n.userId === req.user.id);
  }
  result.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(result);
});

app.get('/api/notes/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').toLowerCase();
  const notes = readNotes();
  const all = req.query.all === 'true' && req.user.role === 'admin';
  let pool;
  if (all) {
    const users = readUsers();
    const userMap = {};
    users.forEach((u) => { userMap[u.id] = u.username; });
    pool = notes.map((n) => ({ ...n, username: userMap[n.userId] || '未知' }));
  } else {
    pool = notes.filter((n) => n.userId === req.user.id);
  }
  const filtered = q
    ? pool.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
    : pool;
  filtered.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json(filtered);
});

app.post('/api/notes', authMiddleware, (req, res) => {
  const { title, content, tags, folderId } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: '标题不能为空' });
  }
  const notes = readNotes();
  const now = new Date().toISOString();
  const note = {
    id: uuidv4(),
    title: title.trim(),
    content: (content || '').trim(),
    tags: Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [],
    folderId: folderId || null,
    userId: req.user.id,
    createdAt: now,
    updatedAt: now,
  };
  notes.push(note);
  writeNotes(notes);
  res.status(201).json(note);
});

app.put('/api/notes/:id', authMiddleware, (req, res) => {
  const notes = readNotes();
  const idx = notes.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '笔记不存在' });
  if (notes[idx].userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权编辑此笔记' });
  }
  // 保存历史快照
  const updatedHistory = saveHistorySnapshot(notes[idx], req.user.id);
  writeHistory(updatedHistory);
  // 应用更新
  const { title, content, tags, folderId } = req.body;
  if (title !== undefined) notes[idx].title = title.trim();
  if (content !== undefined) notes[idx].content = (content || '').trim();
  if (tags !== undefined) notes[idx].tags = Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [];
  if (folderId !== undefined) notes[idx].folderId = folderId || null;
  notes[idx].updatedAt = new Date().toISOString();
  writeNotes(notes);
  res.json(notes[idx]);
});

app.delete('/api/notes/:id', authMiddleware, (req, res) => {
  const notes = readNotes();
  const target = notes.find((n) => n.id === req.params.id);
  if (!target) return res.status(404).json({ error: '笔记不存在' });
  if (target.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权删除此笔记' });
  }
  writeNotes(notes.filter((n) => n.id !== req.params.id));
  res.json({ ok: true });
});

// ---------- 标签 API ----------

app.get('/api/tags', authMiddleware, (req, res) => {
  const notes = readNotes();
  const pool = req.user.role === 'admin' ? notes : notes.filter((n) => n.userId === req.user.id);
  const tagCount = {};
  pool.forEach((n) => {
    (n.tags || []).forEach((t) => {
      tagCount[t] = (tagCount[t] || 0) + 1;
    });
  });
  const tags = Object.entries(tagCount)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  res.json(tags);
});

// ---------- 目录 API ----------

app.get('/api/folders', authMiddleware, (req, res) => {
  const folders = readFolders().filter((f) => f.userId === req.user.id);
  const notes = readNotes().filter((n) => n.userId === req.user.id);
  const tree = buildFolderTree(folders, null, notes);
  const uncategorizedCount = notes.filter((n) => !n.folderId).length;
  res.json({ tree, uncategorizedCount });
});

app.post('/api/folders', authMiddleware, (req, res) => {
  const { name, parentId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: '目录名不能为空' });
  }
  const folders = readFolders();
  // 检查 parentId 是否有效
  if (parentId) {
    const parent = folders.find((f) => f.id === parentId && f.userId === req.user.id);
    if (!parent) return res.status(404).json({ error: '父目录不存在' });
  }
  const folder = {
    id: uuidv4(),
    name: name.trim(),
    parentId: parentId || null,
    userId: req.user.id,
    createdAt: new Date().toISOString(),
  };
  folders.push(folder);
  writeFolders(folders);
  res.status(201).json(folder);
});

app.put('/api/folders/:id', authMiddleware, (req, res) => {
  const folders = readFolders();
  const idx = folders.findIndex((f) => f.id === req.params.id && f.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: '目录不存在' });
  const { name, parentId } = req.body;
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: '目录名不能为空' });
    folders[idx].name = name.trim();
  }
  if (parentId !== undefined) {
    // 防止循环引用
    if (parentId === req.params.id) return res.status(400).json({ error: '不能将目录移动到自身下' });
    if (parentId) {
      const parent = folders.find((f) => f.id === parentId && f.userId === req.user.id);
      if (!parent) return res.status(404).json({ error: '目标父目录不存在' });
    }
    folders[idx].parentId = parentId || null;
  }
  writeFolders(folders);
  res.json(folders[idx]);
});

app.delete('/api/folders/:id', authMiddleware, (req, res) => {
  const folders = readFolders();
  const target = folders.find((f) => f.id === req.params.id && f.userId === req.user.id);
  if (!target) return res.status(404).json({ error: '目录不存在' });
  // 删除该目录及所有子目录
  function collectDescendants(parentId) {
    const children = folders.filter((f) => f.parentId === parentId);
    let ids = [parentId];
    children.forEach((c) => { ids = ids.concat(collectDescendants(c.id)); });
    return ids;
  }
  const toDelete = collectDescendants(req.params.id);
  const remaining = folders.filter((f) => !toDelete.includes(f.id));
  writeFolders(remaining);
  // 将这些目录下的笔记设为未分类
  const notes = readNotes();
  let noteChanged = false;
  notes.forEach((n) => {
    if (toDelete.includes(n.folderId)) { n.folderId = null; noteChanged = true; }
  });
  if (noteChanged) writeNotes(notes);
  res.json({ ok: true });
});

// ---------- 历史 API ----------

app.get('/api/notes/:id/history', authMiddleware, (req, res) => {
  const notes = readNotes();
  const note = notes.find((n) => n.id === req.params.id);
  if (!note) return res.status(404).json({ error: '笔记不存在' });
  if (note.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权查看' });
  }
  const history = readHistory()
    .filter((h) => h.noteId === req.params.id)
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
  res.json(history);
});

app.post('/api/notes/:id/restore/:historyId', authMiddleware, (req, res) => {
  const notes = readNotes();
  const idx = notes.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '笔记不存在' });
  if (notes[idx].userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: '无权操作' });
  }
  const history = readHistory();
  const entry = history.find((h) => h.id === req.params.historyId && h.noteId === req.params.id);
  if (!entry) return res.status(404).json({ error: '历史版本不存在' });
  // 恢复前先保存当前版本
  const updatedHistory = saveHistorySnapshot(notes[idx], req.user.id);
  writeHistory(updatedHistory);
  // 恢复
  notes[idx].title = entry.title;
  notes[idx].content = entry.content;
  notes[idx].tags = entry.tags || [];
  notes[idx].folderId = entry.folderId || null;
  notes[idx].updatedAt = new Date().toISOString();
  writeNotes(notes);
  res.json(notes[idx]);
});

// ---------- 管理员 API ----------

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const users = readUsers();
  res.json(users.map(({ password, ...u }) => u));
});

app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim() || !password || password.length < 4) {
    return res.status(400).json({ error: '用户名不能为空，密码至少4位' });
  }
  const users = readUsers();
  if (users.find((u) => u.username === username.trim())) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const user = {
    id: uuidv4(),
    username: username.trim(),
    password: hashPassword(password),
    role: 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  const { password: _, ...safe } = user;
  res.status(201).json(safe);
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '用户不存在' });
  const { username, password, role } = req.body;
  if (username !== undefined) {
    if (!username.trim()) return res.status(400).json({ error: '用户名不能为空' });
    const dup = users.find((u) => u.username === username.trim() && u.id !== req.params.id);
    if (dup) return res.status(409).json({ error: '用户名已存在' });
    users[idx].username = username.trim();
  }
  if (password !== undefined) {
    if (password.length < 4) return res.status(400).json({ error: '密码至少4位' });
    users[idx].password = hashPassword(password);
  }
  if (role !== undefined) {
    if (users[idx].id === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: '不能取消自己的管理员权限' });
    }
    users[idx].role = role;
  }
  writeUsers(users);
  const { password: _, ...safe } = users[idx];
  res.json(safe);
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: '不能删除自己' });
  }
  let users = readUsers();
  const target = users.find((u) => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: '用户不存在' });
  users = users.filter((u) => u.id !== req.params.id);
  writeUsers(users);
  const notes = readNotes().filter((n) => n.userId !== req.params.id);
  writeNotes(notes);
  res.json({ ok: true });
});

// ---------- 迁移旧数据 ----------

function migrateExistingNotes() {
  const notes = readNotes();
  let changed = false;
  // 补充缺失的 userId
  const noUser = notes.filter((n) => !n.userId);
  if (noUser.length > 0) {
    const users = readUsers();
    const admin = users.find((u) => u.role === 'admin');
    if (admin) {
      noUser.forEach((n) => { n.userId = admin.id; });
      console.log(`已迁移 ${noUser.length} 条旧笔记到管理员账户`);
      changed = true;
    }
  }
  // 补充缺失的 tags
  const noTags = notes.filter((n) => !Array.isArray(n.tags));
  if (noTags.length > 0) {
    noTags.forEach((n) => { n.tags = []; });
    console.log(`已为 ${noTags.length} 条笔记补充 tags 字段`);
    changed = true;
  }
  // 补充缺失的 folderId
  const noFolder = notes.filter((n) => n.folderId === undefined);
  if (noFolder.length > 0) {
    noFolder.forEach((n) => { n.folderId = null; });
    console.log(`已为 ${noFolder.length} 条笔记补充 folderId 字段`);
    changed = true;
  }
  if (changed) writeNotes(notes);
}

// ---------- 启动 ----------

readUsers();
migrateExistingNotes();

app.listen(PORT, () => {
  console.log(`备忘录已启动: http://localhost:${PORT}`);
  console.log(`管理员账户: ${ADMIN_USERNAME}`);
});
