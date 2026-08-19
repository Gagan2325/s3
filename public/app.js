const state = {
  apiKey: localStorage.getItem('mediaStoreApiKey') || '',
  buckets: [],
  currentBucket: null,
  objects: [],
};

const el = {
  apiKey: document.getElementById('apiKey'),
  saveKey: document.getElementById('saveKey'),
  keyStatus: document.getElementById('keyStatus'),
  bucketList: document.getElementById('bucketList'),
  bucketCount: document.getElementById('bucketCount'),
  newBucketForm: document.getElementById('newBucketForm'),
  newBucketName: document.getElementById('newBucketName'),
  currentBucketLabel: document.getElementById('currentBucketLabel'),
  objectCount: document.getElementById('objectCount'),
  objectTable: document.getElementById('objectTable'),
  objectRows: document.getElementById('objectRows'),
  uploadZone: document.getElementById('uploadZone'),
  fileInput: document.getElementById('fileInput'),
  emptyState: document.getElementById('emptyState'),
  toast: document.getElementById('toast'),
};

function toast(msg, isError = false) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  el.toast.className = 'toast' + (isError ? ' error' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.toast.hidden = true), 3200);
}

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (state.apiKey) headers['X-Api-Key'] = state.apiKey;
  const res = await fetch(path, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.headers.get('content-type')?.includes('application/json') ? res.json() : res;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = n, i = -1;
  do { val /= 1024; i++; } while (val >= 1024 && i < units.length - 1);
  return `${val.toFixed(1)} ${units[i]}`;
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---- buckets ----
async function loadBuckets() {
  if (!state.apiKey) return;
  try {
    const { buckets } = await api('/buckets');
    state.buckets = buckets;
    renderBuckets();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderBuckets() {
  el.bucketCount.textContent = state.buckets.length;
  el.bucketList.innerHTML = '';
  if (state.buckets.length === 0) {
    el.bucketList.innerHTML = '<li class="empty-hint">no buckets yet</li>';
    return;
  }
  for (const b of state.buckets) {
    const li = document.createElement('li');
    li.className = b.name === state.currentBucket ? 'active' : '';
    li.innerHTML = `<span>${b.name}</span><span class="del" title="delete bucket">✕</span>`;
    li.querySelector('span:first-child').addEventListener('click', () => selectBucket(b.name));
    li.querySelector('.del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBucket(b.name);
    });
    el.bucketList.appendChild(li);
  }
}

el.newBucketForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = el.newBucketName.value.trim();
  if (!name) return;
  try {
    await api(`/buckets/${encodeURIComponent(name)}`, { method: 'PUT' });
    el.newBucketName.value = '';
    toast(`Bucket "${name}" created`);
    await loadBuckets();
  } catch (err) {
    toast(err.message, true);
  }
});

async function deleteBucket(name) {
  if (!confirm(`Delete bucket "${name}" and all its objects?`)) return;
  try {
    await api(`/buckets/${encodeURIComponent(name)}?force=true`, { method: 'DELETE' });
    toast(`Bucket "${name}" deleted`);
    if (state.currentBucket === name) {
      state.currentBucket = null;
      renderObjectsEmpty();
    }
    await loadBuckets();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---- objects ----
async function selectBucket(name) {
  state.currentBucket = name;
  el.currentBucketLabel.textContent = name;
  el.uploadZone.hidden = false;
  renderBuckets();
  await loadObjects();
}

async function loadObjects() {
  if (!state.currentBucket) return;
  try {
    const { objects } = await api(`/buckets/${encodeURIComponent(state.currentBucket)}/objects`);
    state.objects = objects;
    renderObjects();
  } catch (err) {
    toast(err.message, true);
  }
}

function renderObjectsEmpty() {
  el.currentBucketLabel.textContent = 'select a bucket';
  el.objectCount.textContent = '0';
  el.uploadZone.hidden = true;
  el.objectTable.hidden = true;
  el.emptyState.hidden = false;
}

function renderObjects() {
  el.objectCount.textContent = state.objects.length;
  if (state.objects.length === 0) {
    el.objectTable.hidden = true;
    el.emptyState.hidden = false;
    el.emptyState.innerHTML = '<p>empty bucket</p><p class="muted">upload a file above to fill it in</p>';
    return;
  }
  el.emptyState.hidden = true;
  el.objectTable.hidden = false;
  el.objectRows.innerHTML = '';
  for (const o of state.objects) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="key-cell">${o.key}</td>
      <td class="muted-cell">${fmtBytes(o.size)}</td>
      <td class="muted-cell">${o.content_type || '—'}</td>
      <td class="muted-cell">${fmtDate(o.updated_at)}</td>
      <td><div class="row-actions">
        <button data-act="download">get</button>
        <button data-act="link">link</button>
        <button data-act="delete" class="danger">del</button>
      </div></td>
    `;
    tr.querySelector('[data-act="download"]').addEventListener('click', () => downloadObject(o.key));
    tr.querySelector('[data-act="link"]').addEventListener('click', () => presignObject(o.key));
    tr.querySelector('[data-act="delete"]').addEventListener('click', () => deleteObject(o.key));
    el.objectRows.appendChild(tr);
  }
}

el.fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const file of files) {
    await uploadFile(file);
  }
  el.fileInput.value = '';
  await loadObjects();
});

async function uploadFile(file) {
  try {
    await api(`/buckets/${encodeURIComponent(state.currentBucket)}/objects/${encodeURIComponent(file.name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    });
    toast(`Uploaded ${file.name}`);
  } catch (err) {
    toast(`Failed to upload ${file.name}: ${err.message}`, true);
  }
}

async function downloadObject(key) {
  const url = `/buckets/${encodeURIComponent(state.currentBucket)}/objects/${encodeURIComponent(key)}`;
  const a = document.createElement('a');
  const res = await fetch(url, { headers: { 'X-Api-Key': state.apiKey } });
  const blob = await res.blob();
  a.href = URL.createObjectURL(blob);
  a.download = key;
  a.click();
}

async function presignObject(key) {
  try {
    const res = await api(
      `/buckets/${encodeURIComponent(state.currentBucket)}/objects/presign/${encodeURIComponent(key)}?method=GET&expiresIn=3600`,
      { method: 'POST' }
    );
    await navigator.clipboard.writeText(res.url);
    toast('Presigned link copied (expires in 1h)');
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteObject(key) {
  if (!confirm(`Delete "${key}"?`)) return;
  try {
    await api(`/buckets/${encodeURIComponent(state.currentBucket)}/objects/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    });
    toast(`Deleted ${key}`);
    await loadObjects();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---- key connection ----
function setKeyStatus(connected) {
  el.keyStatus.classList.toggle('connected', connected);
  el.keyStatus.title = connected ? 'connected' : 'not connected';
}

el.saveKey.addEventListener('click', async () => {
  const key = el.apiKey.value.trim();
  if (!key) return;
  state.apiKey = key;
  localStorage.setItem('mediaStoreApiKey', key);
  el.apiKey.value = '';
  try {
    await loadBuckets();
    setKeyStatus(true);
    toast('Connected');
  } catch (err) {
    setKeyStatus(false);
    toast('Could not connect with that key', true);
  }
});

// init
if (state.apiKey) {
  setKeyStatus(true);
  loadBuckets();
}
