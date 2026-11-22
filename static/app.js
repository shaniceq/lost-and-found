// DocuAI — Python edition frontend (vanilla JS, no build step)

// ---------------------------------------------------------------- icons ---
const ICONS = {
  'file-text': '<path d="M6 2h7l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M13 2v5h5"/>',
  clipboard: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3h6v3H9z"/>',
  heart: '<path d="M12 20s-7-4.4-9.2-8.6C1.2 8 3 5 6.2 5 8.4 5 10 6.3 12 8.5 14 6.3 15.6 5 17.8 5 21 5 22.8 8 20.9 11.4 19 15.6 12 20 12 20z"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>',
  archive: '<rect x="3" y="4" width="18" height="4"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 6h16"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  upload: '<path d="M12 16V3"/><path d="M7 8l5-5 5 5"/><path d="M5 21h14"/>',
  download: '<path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M5 21h14"/>',
  sparkles: '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/>',
  dots: '<circle cx="12" cy="6" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="18" r="1.3"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v.01M12 11v5"/>',
  loader: '<path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
};
function icon(name, size) {
  size = size || 15;
  return `<svg class="icon" viewBox="0 0 24 24" width="${size}" height="${size}">${ICONS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------- state ---
const INITIAL_MESSAGES = [
  { role: 'assistant', text: 'Hi, I\u2019m your AI Document Buddy. Tell me what document you need or ask me anything!' },
];

const state = {
  documents: [],
  activeId: null,
  draftType: null,
  messages: INITIAL_MESSAGES.slice(),
  composer: '',
  thinking: false,
  form: emptyForm(),
  selectedType: 'resume',
  draftTitle: '',
  draftContent: '',
  draftTemplate: 'template-1',
  design: null,
  mobileNav: false,
  openMenuId: null,
  modal: null, // 'create' | 'edit' | 'gallery' | 'delete' | 'how' | 'saved'
  deleteTargetId: null,
  deleteTargetTitle: null,
  savedPreviewId: null,
  dirty: false,
  editingSaved: false,
  stash: null,
};

let TEMPLATES = [];
function templateConfig(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0] || {
    id: 'template-1', name: 'Classic Corporate', font: 'Georgia, serif', pdfFont: 'Times-Roman', layout: 'left', nameSize: 22, bodySize: 10.5, headStyle: 'rule', caps: true,
    primary: '#1f2d3d', accent: '#8a6d3b', background: '#ffffff', text: '#222b36', muted: '#6b7380',
  };
}
function templateArchetype(id) {
  return 'layout-' + (templateConfig(id).layout || 'left');
}
function templateVarsStyle(cfg) {
  const ns = ((cfg.nameSize || 22) * 0.88).toFixed(1);
  const bs = ((cfg.bodySize || 10.5) * 1).toFixed(1);
  return `--template-font:${cfg.font};--template-primary:${cfg.primary};--template-accent:${cfg.accent};--template-background:${cfg.background};--template-text:${cfg.text};--template-muted:${cfg.muted};--template-name-size:${ns}px;--template-body-size:${bs}px;--template-caps:${cfg.caps ? 'uppercase' : 'none'};`;
}

function activeDocument() {
  return state.documents.find((d) => d.id === state.activeId) || null;
}

function inferForm(info) {
  const f = emptyForm();
  Object.keys(f).forEach((k) => { f[k] = typeof info[k] === 'string' ? info[k] : ''; });
  if (info.generationSource === 'import') f.generationSource = 'import';
  return f;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return 'Just now';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

let toastTimer = null;
function showToast(text) {
  clearTimeout(toastTimer);
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = 'flex';
  toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2800);
}

// ------------------------------------------------------------------ API ---
async function apiFetch(path, options) {
  const res = await fetch(path, options);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Please log in to continue.'); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'Request failed');
  return data;
}
async function loadDocuments() {
  try {
    state.documents = await apiFetch('/api/documents');
  } catch (e) {
    state.documents = [];
  }
  renderSidebar();
  renderWorkplace();
}
async function createDocumentAPI(payload) {
  return apiFetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
async function updateDocumentAPI(id, payload) {
  return apiFetch(`/api/documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}
async function deleteDocumentAPI(id) {
  return apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
}
async function downloadExport(kind, doc) {
  const res = await fetch(`/api/export/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: doc.title, content: doc.content, type: doc.type, info: doc.info, templateId: doc.templateId }),
  });
  if (res.status === 401) { window.location.href = '/login'; return; }
  if (!res.ok) { showToast('Export failed'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${doc.title || 'document'}.${kind === 'pdf' ? 'pdf' : 'docx'}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// -------------------------------------------------------------- actions ---
function startCreate(type) {
  resetAiPanel();
  state.selectedType = type;
  state.form = emptyForm();
  state.activeId = null;
  state.draftType = null;
  state.draftTitle = '';
  state.draftContent = '';
  state.draftTemplate = 'template-1'; state.design = null;
  state.modal = 'create';
  renderModal();
}

// The "What document would you like to create?" prompt shows after every reply. Starting a new one
// replaces the current unsaved draft, so ask first.
function chooseNewDocument(type) {
  if (state.draftType || state.activeId || state.dirty) {
    state.pendingType = type;
    state.modal = 'newdoc';
    renderModal();
    return;
  }
  startCreate(type);
}

function generateDraft() {
  if (!state.form.name.trim()) { showToast('Add your full name first'); return; }
  if (!hasMeaningfulFormData(state.form)) { showToast('Add at least one document detail first'); return; }
  const label = TYPE_LABELS[state.selectedType];
  const title = `${state.form.name || 'Untitled'} \u2014 ${label}`;
  state.draftType = state.selectedType;
  state.draftTitle = title;
  state.draftContent = buildContent(state.selectedType, state.form);
  state.draftTemplate = 'template-1'; state.design = null;
  state.messages.push({ role: 'user', text: `Create my ${label.toLowerCase()} using the information I provided.` });
  state.messages.push({ role: 'assistant', text: `Your ${label.toLowerCase()} is ready in the live preview. This is an unsaved draft. Save it to keep it in My Documents, or choose Don't save to discard it.` });
  state.modal = null;
  showToast('Document generated \u2014 save it if you want to keep it');
  renderModal();
  renderChat();
  renderWorkplace();
}

// After a save: clear the working draft and ask what to do next (same prompt + document choices as a new chat)
function promptAfterSave(savedText) {
  resetAiPanel();
  state.activeId = null;
  state.draftType = null;
  state.draftTitle = '';
  state.draftContent = '';
  state.draftTemplate = 'template-1';
  state.design = null;
  state.form = emptyForm();
  state.dirty = false;
  state.messages.push({ role: 'assistant', text: savedText });
}

async function saveDraft() {
  if (!state.draftType || !state.draftTitle.trim()) return;
  try {
    const doc = await createDocumentAPI({ type: state.draftType, title: state.draftTitle.trim(), info: infoWithDesign(), content: state.draftContent, templateId: state.draftTemplate });
    promptAfterSave(`Saved \u201C${doc.title}\u201D to My Documents.`);
    await loadDocuments();
    showToast('Document saved');
    renderChat();
    renderWorkplace();
  } catch (e) {
    showToast('Could not save document');
  }
}

function discardDraft() {
  resetAiPanel();
  state.activeId = null;
  state.draftType = null;
  state.draftTitle = '';
  state.draftContent = '';
  state.draftTemplate = 'template-1'; state.design = null;
  state.form = emptyForm();
  state.dirty = false;
  state.messages.push({ role: 'assistant', text: 'Okay, I discarded that unsaved document. You can start again whenever you are ready.' });
  showToast('Unsaved document discarded');
  renderChat();
  renderWorkplace();
}

function setDirty(value) {
  state.dirty = value;
  syncDocControls();
  const btn = document.querySelector('[data-act="save-existing"]');
  if (btn) {
    btn.disabled = !value;
    btn.classList.toggle('is-dirty', value);
    btn.innerHTML = value ? `${icon('check', 12)} Save changes` : `${icon('check', 12)} Saved`;
  }
}

async function saveExistingNow() {
  if (!state.activeId) return;
  const docType = (activeDocument() && activeDocument().type) || state.draftType;
  try {
    const doc = await createDocumentAPI({ type: docType, title: state.draftTitle.trim(), info: infoWithDesign(), content: state.draftContent, templateId: state.draftTemplate });
    promptAfterSave(`Saved your changes as a new document, \u201C${doc.title}\u201D, in My Documents. The original is untouched.`);
    await loadDocuments();
    showToast('Saved as a new document');
    renderChat();
    renderWorkplace();
  } catch (e) { showToast('Could not save document'); }
}

async function saveInfo() {
  const currentType = (activeDocument() && activeDocument().type) || state.draftType;
  const imported = state.form.generationSource === 'import';   // imported text is not built from the form fields
  const nextContent = currentType && !imported ? buildContent(currentType, state.form) : state.draftContent;
  state.draftContent = nextContent;
  state.modal = null;
  if (state.activeId) {
    setDirty(true);
    showToast('Info updated \u2014 save to keep these changes');
  } else {
    showToast('Draft information updated');
  }
  state.messages.push({ role: 'assistant', text: 'I updated the document information. Chat and Workplace now show the same details.' });
  renderModal();
  renderChat();
  renderWorkplace();
}

function chooseTemplate(templateId) {
  state.draftTemplate = templateId;
  state.design = null;
  state.modal = null;
  if (state.activeId) {
    setDirty(true);
    showToast('Template applied \u2014 save to keep this change');
  } else {
    showToast('Template applied to this draft');
  }
  renderModal();
  renderChat();
  renderWorkplace();
}

// ---- edit a saved document straight in the full preview editor (no chat message) ----
const STASH_KEYS = ['messages', 'activeId', 'draftType', 'draftTitle', 'draftContent', 'draftTemplate', 'design', 'form', 'dirty', 'composer'];
function editSavedDocument(id) {
  resetAiPanel();
  const doc = state.documents.find((d) => d.id === id);
  if (!doc || state.editingSaved) return;
  state.stash = {}; STASH_KEYS.forEach((k) => { state.stash[k] = state[k]; });
  const info = doc.info || {};
  state.activeId = doc.id;
  state.draftType = null;
  state.draftTitle = doc.title;
  state.draftContent = doc.content;
  state.draftTemplate = doc.templateId || 'template-1';
  state.form = inferForm(info);
  if (info.paperSize) state.form.paperSize = info.paperSize;
  state.design = info.design && Array.isArray(info.design.els) ? JSON.parse(JSON.stringify(info.design)) : null;
  state.dirty = false;   // the chat conversation stays as it was
  state.editingSaved = true;
  state.openMenuId = null;
  state.modal = null;
  Designer.resetHistory();
  closeMobileSidebar();
  document.querySelector('.app-frame').classList.add('editing-saved');
  const hint = document.getElementById('wpHint');
  renderModal();
  renderSidebar();
  renderChat();
  renderWorkplace();
  if (hint) hint.textContent = `Editing \u201C${doc.title}\u201D`;
}

function leaveEditSaved() {
  resetAiPanel();
  if (state.stash) STASH_KEYS.forEach((k) => { if (k !== 'messages') state[k] = state.stash[k]; });   // keep messages sent while editing
  state.stash = null;
  state.editingSaved = false;
  state.dirty = false;
  Designer.resetHistory();
  document.querySelector('.app-frame').classList.remove('editing-saved');
  setChatHidden(false);
  renderSidebar();
  renderChat();
}

function askConfirm(cfg) {
  state.confirmCfg = cfg;
  state.modal = 'confirm';
  renderModal();
}

function cancelEditSaved() {
  if (!state.editingSaved) return;
  if (state.dirty) {
    askConfirm({
      title: 'Discard your changes?',
      text: 'The edits you made to this document will be lost. The saved version in My Documents stays as it was.',
      cancelLabel: 'Keep editing', confirmLabel: 'Discard changes', icon: 'x', danger: true,
      onConfirm: leaveEditSaved,
    });
    return;
  }
  leaveEditSaved();
}

async function saveEditedDocument() {
  if (!state.editingSaved || !state.activeId) return;
  const btn = document.getElementById('editSave');
  if (btn) btn.disabled = true;
  try {
    await updateDocumentAPI(state.activeId, { title: state.draftTitle.trim() || 'Untitled', info: infoWithDesign(), content: state.draftContent, templateId: state.draftTemplate });
    const savedTitle = state.draftTitle.trim() || 'Untitled';
    await loadDocuments();
    leaveEditSaved();
    state.messages.push({ role: 'assistant', text: `Saved your changes to \u201C${savedTitle}\u201D in My Documents.` });
    renderChat();
    showToast('Document updated');
  } catch (e) {
    showToast('Could not save document');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function removeDocument() {
  if (!state.deleteTargetId) return;
  const targetId = state.deleteTargetId;
  try {
    await deleteDocumentAPI(targetId);
    state.modal = null;
    state.deleteTargetId = null;
    state.deleteTargetTitle = null;
    if (state.activeId === targetId) {
      state.activeId = null; state.draftType = null; state.draftTitle = ''; state.draftContent = '';
      state.draftTemplate = 'template-1'; state.design = null; state.form = emptyForm(); state.messages = INITIAL_MESSAGES.slice(); state.dirty = false;
    }
    if (state.savedPreviewId === targetId) { state.savedPreviewId = null; }
    await loadDocuments();
    showToast('Document deleted permanently');
    renderModal();
    renderChat();
    renderWorkplace();
  } catch (e) { showToast('Could not delete document'); }
}

function askClearChat() {
  state.modal = 'clear';
  renderModal();
}

function clearChat() {
  // only the conversation is cleared; the live preview (draft or open document) stays exactly as it is
  resetAiPanel();
  state.messages = INITIAL_MESSAGES.slice();
  state.composer = '';
  state.modal = null;
  showToast('Chat cleared');
  renderModal();
  renderChat();
}

// "change the name into Maria Santos" typed in chat -> the document itself is updated
function parseNameChange(prompt) {
  const text = prompt.trim();
  const m = text.match(/\b(?:change|set|update|replace|edit|make)\b[^.\n]*?\bname\b[^.\n]*?\b(?:to|into|as|with)\s+(.+)$/i)
    || text.match(/\brename\b[^.\n]*?\b(?:to|as|into)\s+(.+)$/i);
  if (!m) return null;
  const name = m[1].trim().replace(/^["\u201C\u2018']+|["\u201D\u2019'.!]+$/g, '').trim();
  return name.length >= 2 && name.length <= 60 ? name : null;
}

function applyNameChange(newName) {
  const oldName = (state.form.name || '').trim();
  state.form.name = newName;
  if (oldName) {
    const swap = (t) => String(t).split(oldName).join(newName);
    state.draftContent = swap(state.draftContent);
    if (state.draftTitle) state.draftTitle = swap(state.draftTitle);
    if (state.design && Array.isArray(state.design.els)) state.design.els.forEach((e) => { if (e.kind === 'text' && e.text) e.text = swap(e.text); });
  } else if (state.draftTitle && !state.activeId) {
    state.draftTitle = `${newName} \u2014 ${TYPE_LABELS[(activeDocument() && activeDocument().type) || state.draftType] || 'Document'}`;
  }
  if (state.activeId) setDirty(true);
  state.messages.push({ role: 'assistant', text: oldName ? `Done \u2014 I changed the name on your document from \u201C${oldName}\u201D to \u201C${newName}\u201D.` : `Done \u2014 the name on your document is now \u201C${newName}\u201D.` });
  renderChat();
  renderWorkplace();
}

// "change Shanice to Maria" -> literal find & replace everywhere the text appears (header, body, page text boxes, info fields)
function parseReplace(prompt) {
  const m = prompt.trim().match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:change|replace|rename|update|edit|switch)\s+(?:the\s+)?(?:word\s+|text\s+|name\s+)?["\u201C\u2018']?(.+?)["\u201D\u2019']?\s+(?:to|into|with|as)\s+["\u201C\u2018']?(.+?)["\u201D\u2019']?[.!?]?\s*$/i);
  if (!m) return null;
  const from = m[1].trim(), to = m[2].trim();
  if (from.length < 2 || from.length > 120 || !to || to.length > 120 || from.toLowerCase() === to.toLowerCase() && from === to) return null;
  return { from, to };
}

const FORM_SKIP_REPLACE = new Set(['photoData', 'photoSourceData', 'photoCrop', 'paperSize', 'pageMargin', 'customWidth', 'customHeight', 'signatureData', 'generationSource', 'chatIncludesHeader', 'design']);

function applyReplace(from, to) {
  const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let count = 0;
  const swap = (t) => String(t).replace(re, () => { count += 1; return to; });
  state.draftContent = swap(state.draftContent || '');
  if (state.draftTitle) state.draftTitle = swap(state.draftTitle);
  Object.keys(state.form).forEach((k) => {
    if (FORM_SKIP_REPLACE.has(k) || typeof state.form[k] !== 'string') return;
    state.form[k] = swap(state.form[k]);
  });
  if (state.design && Array.isArray(state.design.els)) {
    state.design.els.forEach((e) => { if (e.kind === 'text' && !e.linked && e.text) e.text = swap(e.text); });
  }
  if (!count) return false;
  if (state.activeId) setDirty(true);
  state.messages.push({ role: 'assistant', text: `Done \u2014 I changed \u201C${from}\u201D to \u201C${to}\u201D${count > 1 ? ` in ${count} places` : ''}.${state.activeId ? ' Save to keep the change.' : ''}` });
  renderChat();
  renderWorkplace();
  return true;
}

function sendMessage() {
  const prompt = state.composer.trim();
  if (!prompt || state.thinking) return;
  state.composer = '';
  state.messages.push({ role: 'user', text: prompt });
  const lower = prompt.toLowerCase();
  const asksForGuidance = /\b(tip|tips|advice|suggestion|suggestions|how do i|how can i|what if|why|explain)\b/i.test(lower);
  const isDocumentRequest = !asksForGuidance && /resume|curriculum vitae|cover letter|application letter|scholarship letter|internship letter|document|create|make|write/i.test(lower);
  const requestedType = requestedDocumentType(prompt);
  const hasDoc = Boolean(activeDocument() || state.draftType);
  const nameChange = hasDoc ? parseNameChange(prompt) : null;
  if (nameChange) { applyNameChange(nameChange); return; }
  const replaceReq = hasDoc ? parseReplace(prompt) : null;
  if (replaceReq && applyReplace(replaceReq.from, replaceReq.to)) return;
  if (hasDoc && /\b(suggest(?:ion)?s?|recommend(?:ation)?s?)\b/i.test(prompt)) { requestSuggestions(prompt, true); return; }
  if (hasDoc && /\b(review|check)\b.*\b(document|draft|letter|resume|cv)\b/i.test(prompt)) { reviewCurrentDocument(true); return; }
  if (!hasDoc && isDocumentRequest) {
    const nextType = requestedType || 'resume';
    state.selectedType = nextType;
    state.form = requestedType ? state.form : { ...state.form, details: prompt };
    state.modal = 'create';
    renderChat();
    renderModal();
    return;
  }
  if (hasDoc && looksLikeEditRequest(prompt)) { editDocumentWithAI(prompt); return; }
  state.thinking = true;
  renderChat();
  askAssistant(prompt, hasDoc);
}

async function askAssistant(prompt, hasDoc) {
  const docType = (activeDocument() && activeDocument().type) || state.draftType;
  const history = state.messages.slice(0, -1).filter((m) => m.text).slice(-6).map((m) => ({ role: m.role, content: m.text }));
  let reply = null;
  let fromServer = false;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: prompt,
        history,
        documentType: docType || undefined,
        documentContent: hasDoc ? state.draftContent : undefined,
      }),
    });
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json().catch(() => null);
    if (data && data.reply) { reply = data.reply; fromServer = true; }
    else if (data && data.error) { reply = data.error; fromServer = true; }
  } catch (e) { /* server unreachable: fall back to the built-in reply below */ }
  if (!reply) reply = getAssistantReply(prompt, hasDoc, docType, state.draftTemplate);
  state.messages.push({ role: 'assistant', text: reply });
  if (!fromServer && hasDoc) state.messages.push({ role: 'assistant', text: 'Would you like to generate another document?' });
  state.thinking = false;
  renderChat();
  renderWorkplace();
}

// ------------------------------------------------------------- renderers ---
function root() { return document.getElementById('root'); }

function shellHTML() {
  return `
  <main class="app-frame">
    <button class="mobile-overlay" style="display:none" id="mobileOverlay"></button>
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="robot-mark"><span class="robot-antenna"></span><span class="robot-face"><span></span><span></span></span></div>
        <div><div class="brand-name">Docu<span>AI</span></div><div class="brand-subtitle">AI Document Assistant</div></div>
        <button class="mobile-close" id="closeSidebar" aria-label="Close menu">${icon('x', 16)}</button>
      </div>
      <div class="sidebar-scroll">
        <div class="sidebar-heading">My Documents</div>
        <div class="document-list" id="documentList"></div>
        <button class="new-document-button" id="newDocumentBtn">${icon('plus', 16)} New Document</button>
        <input type="file" id="importFile" accept=".pdf,.docx,.txt" hidden />
      </div>
      <div class="sidebar-art">
        <div class="art-sparkle one">\u2726</div><div class="art-sparkle two">\u2726</div>
        <div class="robot-mark"><span class="robot-antenna"></span><span class="robot-face"><span></span><span></span></span></div>
        <p>\u201CGood documents open doors.<br />Let\u2019s build yours together.\u201D</p>
        <span class="art-heart">\u2661</span>
      </div>
      <div id="accountSlot"></div>
    </aside>
    <section class="assistant-workspace">
      <div class="topbar">
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="mobile-menu" id="openSidebar" aria-label="Open menu">${icon('layout', 18)}</button>
          <div><h1>DocuAI Chat <span class="wave">\uD83D\uDC4B</span></h1><p>Create, edit, and manage your documents with AI</p></div>
        </div>
        <div class="top-actions">
          <button id="openPreview" class="mobile-only">${icon('layout', 14)} Preview</button>
          <button id="howBtn">${icon('info', 14)} How it works</button>
          <button class="clear-button" id="clearChatBtn">${icon('trash', 14)} Clear Chat</button>
        </div>
      </div>
      <div class="chat-scroll" id="chatScroll"><div class="chat-content" id="chatContent"></div></div>
      <div class="composer-wrap">
        <div class="quick-chips" id="quickChips"></div>
        <div class="composer">
          <textarea id="composerInput" placeholder="Ask a question or describe the document you need..."></textarea>
          <button class="send-button" id="sendBtn" disabled>${icon('send', 14)}</button>
        </div>
        <div class="composer-tools">Press Enter to send \u00B7 Shift+Enter for a new line</div>
      </div>
    </section>
    <aside class="workplace" id="workplace">
      <div class="wp-resizer" id="wpResizer" role="separator" aria-orientation="vertical" aria-label="Drag to resize the live preview" title="Drag to resize \u00B7 double-click to reset"></div>
      <div class="workplace-header">
        <div><p class="eyebrow">Live preview</p><h2>Workplace</h2><span id="wpHint"></span></div>
        <div class="workplace-header-actions">
          <button type="button" id="closePreview" class="mobile-only">Back to chat</button>
          <button type="button" id="editCancel">Cancel</button>
          <button type="button" id="editSave">Save</button>
        </div>
      </div>
      <div class="wp-stage">
        <div class="workplace-scroll" id="workplaceScroll"></div>
        <div class="dl-fab-wrap" id="dlFabWrap" style="display:none">
          <div class="dl-menu" id="dlMenu" hidden>
            <button type="button" data-dl="pdf">${icon('download', 12)} Download PDF</button>
            <button type="button" data-dl="docx">${icon('download', 12)} Download Word</button>
          </div>
          <button type="button" class="dl-fab" id="dlFab" title="Download" aria-label="Download" aria-haspopup="true" aria-expanded="false">${icon('download', 18)}</button>
        </div>
      </div>
      <div class="generated-actions wp-actions" id="wpActions" style="display:none"></div>
    </aside>
  </main>
  <div id="modalRoot"></div>`;
}

// Drag the left edge of the live preview to make it wider or narrower. Default size is unchanged until dragged.
function initPreviewResizer() {
  const handle = document.getElementById('wpResizer'), panel = document.getElementById('workplace'), frame = document.querySelector('.app-frame');
  if (!handle || !panel || !frame) return;
  const MIN = 320;
  const maxWidth = () => {
    const sb = document.getElementById('sidebar');
    return Math.max(MIN, frame.clientWidth - (sb ? sb.offsetWidth : 0) - 360);
  };
  const setWidth = (w) => {
    w = Math.round(Math.min(maxWidth(), Math.max(MIN, w)));
    frame.style.setProperty('--wp-w', w + 'px');
    frame.setAttribute('data-wp-resized', '');
  };
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX, startW = panel.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('wp-resizing');
    const move = (ev) => setWidth(startW + (startX - ev.clientX));
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      document.body.classList.remove('wp-resizing');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('dblclick', () => { frame.style.removeProperty('--wp-w'); frame.removeAttribute('data-wp-resized'); });
}

function init() {
  root().innerHTML = shellHTML();
  document.getElementById('newDocumentBtn').onclick = () => startCreate('resume');
  const importInput = document.getElementById('importFile');
  importInput.onchange = () => { const f = importInput.files && importInput.files[0]; importInput.value = ''; importFile(f); };
  document.getElementById('howBtn').onclick = () => { state.modal = 'how'; renderModal(); };
  document.getElementById('clearChatBtn').onclick = askClearChat;
  initPreviewResizer();
  document.getElementById('editCancel').onclick = cancelEditSaved;
  document.getElementById('editSave').onclick = saveEditedDocument;
  const dlFab = document.getElementById('dlFab'), dlMenu = document.getElementById('dlMenu');
  const closeDl = () => { dlMenu.hidden = true; dlFab.setAttribute('aria-expanded', 'false'); };
  dlFab.onclick = (e) => { e.stopPropagation(); dlMenu.hidden = !dlMenu.hidden; dlFab.setAttribute('aria-expanded', String(!dlMenu.hidden)); };
  dlMenu.querySelectorAll('[data-dl]').forEach((b) => b.onclick = () => { closeDl(); downloadExport(b.dataset.dl, currentDraftAsDoc()); });
  document.addEventListener('click', (e) => { if (!e.target.closest('#dlFabWrap')) closeDl(); });
  const setPreviewOpen = (open) => { document.getElementById('workplace').classList.toggle('mobile-open', open); renderWorkplace(); };
  document.getElementById('openPreview').onclick = () => setPreviewOpen(true);
  document.getElementById('closePreview').onclick = () => setPreviewOpen(false);
  let resizeTimer = null;
  const onViewportChange = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 1024) closeMobileSidebar();
      if (window.innerWidth > 900) document.getElementById('workplace').classList.remove('mobile-open');
      renderWorkplace();
    }, 150);
  };
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  document.getElementById('openSidebar').onclick = () => { document.getElementById('sidebar').classList.add('mobile-open'); document.getElementById('mobileOverlay').style.display = 'block'; };
  document.getElementById('closeSidebar').onclick = closeMobileSidebar;
  document.getElementById('mobileOverlay').onclick = closeMobileSidebar;

  const composer = document.getElementById('composerInput');
  const sendBtn = document.getElementById('sendBtn');
  composer.addEventListener('input', () => { state.composer = composer.value; sendBtn.disabled = !composer.value.trim(); });
  composer.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); composer.value = ''; sendBtn.disabled = true; }
  });
  sendBtn.onclick = () => { sendMessage(); composer.value = ''; sendBtn.disabled = true; };

  renderChat();
  renderWorkplace();
  renderSidebar();
}
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('mobileOverlay').style.display = 'none';
}

function openRename(id) {
  const doc = state.documents.find((d) => d.id === id); if (!doc) return;
  state.renameTargetId = id;
  state.openMenuId = null;
  state.modal = 'rename';
  renderModal();
  renderSidebar();
}

async function renameDocument(id, rawTitle) {
  const title = String(rawTitle || '').trim();
  const doc = state.documents.find((d) => d.id === id);
  if (!doc || !title) return false;
  if (title === doc.title) return true;
  try {
    await updateDocumentAPI(id, { title });
    await loadDocuments();
    if (state.activeId === id) state.draftTitle = title;
    showToast('Document renamed');
    renderSidebar();
    renderWorkplace();
    return true;
  } catch (err) {
    showToast('Could not rename document');
    return false;
  }
}

function renderSidebar() {
  const list = document.getElementById('documentList');
  if (!state.documents.length) {
    list.innerHTML = `<div class="empty-documents">${icon('file-text', 18)}<span>Your saved documents<br />will appear here.</span></div>`;
    return;
  }
  list.innerHTML = state.documents.map((doc) => `
    <div class="document-row ${doc.id === state.activeId ? 'selected' : ''}" data-id="${doc.id}">
      <span class="document-icon ${doc.id === state.activeId ? 'is-active' : ''}">${icon(TYPE_ICONS[doc.type] || 'file-text', 15)}</span>
      <div class="document-row-copy"><strong>${esc(doc.title)}</strong><span>${esc(TYPE_LABELS[doc.type] || doc.type)} \u00B7 ${formatDate(doc.updatedAt)}</span></div>
      <button class="row-menu" data-menu="${doc.id}">${icon('dots', 15)}</button>
      ${state.openMenuId === doc.id ? `
      <div class="row-menu-popover">
        <button data-open="${doc.id}">${icon('eye', 12)} Open</button>
        <button data-edit="${doc.id}">${icon('pen', 12)} Edit</button>
        <button class="danger" data-del="${doc.id}">${icon('trash', 12)} Delete</button>
        <button data-rename="${doc.id}">${icon('pen', 12)} Rename</button>
      </div>` : ''}
    </div>`).join('');

  list.querySelectorAll('[data-menu]').forEach((btn) => btn.onclick = (e) => { e.stopPropagation(); const id = Number(btn.dataset.menu); state.openMenuId = state.openMenuId === id ? null : id; renderSidebar(); });
  list.querySelectorAll('[data-open]').forEach((btn) => btn.onclick = (e) => { e.stopPropagation(); state.savedPreviewId = Number(btn.dataset.open); state.openMenuId = null; state.modal = 'saved'; renderModal(); renderSidebar(); });
  list.querySelectorAll('[data-rename]').forEach((btn) => btn.onclick = (e) => { e.stopPropagation(); openRename(Number(btn.dataset.rename)); });
  list.querySelectorAll('[data-edit]').forEach((btn) => btn.onclick = (e) => { e.stopPropagation(); editSavedDocument(Number(btn.dataset.edit)); });
  list.querySelectorAll('[data-del]').forEach((btn) => btn.onclick = (e) => { e.stopPropagation(); const doc = state.documents.find((d) => d.id === Number(btn.dataset.del)); state.deleteTargetId = doc.id; state.deleteTargetTitle = doc.title; state.openMenuId = null; state.modal = 'delete'; renderModal(); renderSidebar(); });
}

// name / type / contact shown in the chat card. If the Workplace design exists it is the
// source of truth, so anything typed on the preview shows up in the message view too.
function headerTexts(info, docType, design) {
  const out = {
    name: (info.name || '').trim() || 'Document',
    type: TYPE_LABELS[docType] || 'Document',
    contact: [info.phone, info.email, info.location].map((v) => (v || '').trim()).filter(Boolean).join(' \u00B7 '),
  };
  if (design && Array.isArray(design.els)) {
    const pick = (role) => design.els.find((e) => e.kind === 'text' && e.role === role);
    const n = pick('name'), t = pick('type'), c = pick('contact');
    if (n) out.name = String(n.text || '').trim() || out.name;
    if (t) out.type = String(t.text || '').trim() || out.type;
    if (c) { const v = String(c.text || '').trim(); out.contact = /^contact information not provided$/i.test(v) ? '' : v; }
  }
  return out;
}

// Workplace -> Chat: the chat card is a live mirror of the Workplace canvas (same renderer, same
// layout, photo side, shapes, colors, positions). Redrawn on every change, throttled per frame.
let mirrorRaf = null;
function syncChatCard() {
  updateSuggestionControls();
  const ta = document.getElementById('chatDraftTextarea');
  if (ta && ta.value !== state.draftContent && document.activeElement !== ta) ta.value = state.draftContent;
  if (mirrorRaf) return;
  mirrorRaf = requestAnimationFrame(() => { mirrorRaf = null; drawChatMirror(); });
}
function drawChatMirror() {
  const host = document.getElementById('chatMirror');
  if (!host || !state.design || state.design.needsFlow) return;
  Designer.renderMirror(host, state.design, state.form);
  const lab = document.querySelector('#chatMirrorLabel span');
  if (lab) { const n = Designer.pageCount(state.design); lab.textContent = n > 1 ? `Preview \u00B7 page 1 of ${n}` : 'Preview'; }
}

// Workplace contact line edited -> keep the form (Edit info, exports) in step
function applyContactText(text) {
  const t = String(text || '').trim();
  const parts = /^contact information not provided$/i.test(t) ? [] : t.split(/\s*[\u00B7|\u2022]\s*/).map((x) => x.trim()).filter(Boolean);
  let email = '', phone = '';
  const rest = [];
  parts.forEach((x) => {
    if (!email && /\S+@\S+\.\S+/.test(x)) email = x;
    else if (!phone && /^\+?[\d\s().\-]{6,}$/.test(x)) phone = x;
    else rest.push(x);
  });
  state.form.email = email;
  state.form.phone = phone;
  state.form.location = rest.join(', ');
}

function documentSurfaceHTML(opts) {
  const { info, docType, content, templateId, editable, idPrefix, blocks, design } = opts;
  const cfg = templateConfig(templateId);
  const ht = headerTexts(info, docType, design);
  const name = ht.name;
  const contact = ht.contact;
  const links = (info.links || '').trim();
  return `
  <div class="document-surface ${editable ? 'editable' : 'readonly'} ${blocks ? 'with-blocks' : ''} ${templateArchetype(templateId)}" style="${templateVarsStyle(cfg)}">
    <div class="document-identity">
      <div class="generated-header">
        <div class="generated-photo">${info.photoData ? `<img src="${info.photoData}" alt="${esc(name)} profile" />` : esc(name.slice(0, 1).toUpperCase())}</div>
        <div><h2>${esc(name)}</h2><p>${esc(ht.type)}</p><span>${esc(contact || 'Contact information not provided')}</span>
        ${links ? `<small class="document-links">${esc(links)}</small>` : ''}</div>
      </div>
    </div>
    <div class="document-body">
      <div class="document-divider"></div>
      ${blocks ? blocksEditorHTML(content) : `<textarea id="${idPrefix}" ${editable ? '' : 'readonly'} aria-label="${editable ? 'Generated document content' : 'Read-only document preview'}">${esc(content)}</textarea>`}
    </div>
  </div>`;
}

function renderChat() {
  const el = document.getElementById('chatContent');
  const hasDoc = Boolean(activeDocument() || state.draftType);
  const docType = (activeDocument() && activeDocument().type) || state.draftType;
  const info = state.form;

  if (hasDoc) ensureDesign();
  const msgHTML = (m) => {
    if (m.role === 'user') return `<div class="user-message"><div>${esc(m.text)}</div></div>`;
    return `<div class="assistant-message"${m.focus ? ' id="focusMsg"' : ''}><div class="robot-mark robot-mark-small"><span class="robot-antenna"></span><span class="robot-face"><span></span><span></span></span></div><div class="assistant-copy">${esc(m.text)}</div></div>`;
  };
  // the suggestions panel sits where it was requested, so later messages (e.g. a review) appear below it
  const sgAnchor = (state.suggestionsBatch && state.suggestionsBatch.anchor) ?? (state.suggestionsError && state.suggestionsError.anchor);
  const anchor = Math.min(state.messages.length, Number.isInteger(sgAnchor) ? sgAnchor : state.messages.length);
  const panel = chatIsHidden() ? '' : suggestionsPanelHTML();
  let html = state.messages.slice(0, anchor).map(msgHTML).join('') + panel + state.messages.slice(anchor).map(msgHTML).join('');

  if (state.thinking) {
    html += `<div class="typing"><i></i><i></i><i></i></div>`;
  }

  if (!state.thinking) {
    html += `<div class="assistant-message"><div class="robot-mark robot-mark-small"><span class="robot-antenna"></span><span class="robot-face"><span></span><span></span></span></div><div class="assistant-copy">What document would you like to create?</div></div><div class="choice-block"><div class="choice-grid">${DOCUMENT_CHOICES.map((c) => `<button data-choice="${c.value}">${icon(TYPE_ICONS[c.value] || 'file-text', 14)} ${esc(c.label)} ${icon('plus', 12)}</button>`).join('')}<button data-import-choice>${icon('upload', 14)} Import a file</button></div></div>`;
  }

  el.innerHTML = html;
  renderSuggestOverlay();
  drawChatMirror();
  document.getElementById('chatScroll').scrollTop = document.getElementById('chatScroll').scrollHeight;
  const focusEl = document.getElementById('focusMsg');
  if (focusEl) { focusEl.scrollIntoView({ block: 'start' }); state.messages.forEach((m) => { delete m.focus; }); }

  el.querySelectorAll('[data-choice]').forEach((btn) => btn.onclick = () => chooseNewDocument(btn.dataset.choice));
  el.querySelectorAll('[data-import-choice]').forEach((btn) => btn.onclick = () => document.getElementById('importFile').click());
  renderQuickChips();
  bindSuggestionCards();

}

function currentDraftAsDoc() {
  const docType = (activeDocument() && activeDocument().type) || state.draftType;
  return { title: state.draftTitle, content: state.draftContent, type: docType, info: infoWithDesign(), templateId: state.draftTemplate };
}

let wpTimer = null;
function syncWorkplaceTextarea() {
  // chat draft was edited: refresh the Workplace canvas (debounced)
  clearTimeout(wpTimer);
  wpTimer = setTimeout(() => { if (document.querySelector('#workplaceScroll .dz-page')) renderWorkplace(); }, 350);
}

function infoWithDesign() {
  return state.design ? Object.assign({}, state.form, { design: state.design }) : state.form;
}

function contactLine(f) {
  return [f.phone, f.email, f.location].map((v) => (v || '').trim()).filter(Boolean).join(' \u00B7 ') || 'Contact information not provided';
}

function ensureDesign() {
  const docType = (activeDocument() && activeDocument().type) || state.draftType;
  const cfg = templateConfig(state.draftTemplate);
  const label = TYPE_LABELS[docType] || 'Document';
  if (!state.design || state.design.tpl !== cfg.id || !Array.isArray(state.design.els)) {
    state.design = Designer.buildDesign(cfg, state.form, docType, state.draftContent, label);
    Designer.resetHistory();
  } else if (state.design.hash !== Designer.hashStr(state.draftContent)) {
    Designer.syncFromContent(state.design, state.draftContent, cfg);
    state.design.needsFlow = true;
  }
  if (!state.form.paperSize && state.design.paper) state.form.paperSize = state.design.paper;   // saved document keeps its own size
  const wantPaper = Designer.PAPERS[state.form.paperSize] ? state.form.paperSize : 'letter';
  if ((state.design.paper || 'letter') !== wantPaper && Designer.setPaper(state.design, wantPaper)) Designer.resetHistory();
  const d = state.design;
  d.els.forEach((e) => {
    if (!e.linked) return;
    if (e.role === 'name') e.text = (state.form.name || '').trim() || 'Document';
    else if (e.role === 'type') e.text = label;
    else if (e.role === 'contact') e.text = contactLine(state.form);
  });
  const hasPhotoEl = d.els.some((e) => e.role === 'photo');
  if (state.form.photoData && !hasPhotoEl && !['minimal', 'letterhead', 'legal', 'certificate', 'editorial'].includes(cfg.layout)) {
    d.els.push({ id: 'ph' + Date.now().toString(36), kind: 'image', role: 'photo', x: 612 - 54 - 64, y: 46, w: 64, h: 64, src: '' });
  } else if (!state.form.photoData && hasPhotoEl) {
    d.els = d.els.filter((e) => e.role !== 'photo');
  }
}

function designCtx() {
  return {
    getDesign: () => state.design,
    setDesign: (d) => { state.design = d; },
    setContent: (c) => { state.draftContent = c; syncChatCard(); },
    onChange: () => syncChatCard(),
    markDirty: () => { if (state.activeId) setDirty(true); },
    setName: (n) => { state.form.name = n; },
    setContact: (t) => { applyContactText(t); },
    info: () => state.form,
    cfg: () => templateConfig(state.draftTemplate),
    setPaper: (k) => changePaper(k),
    setZoom: (z) => { Designer.setZoom(z); renderWorkplace(); },
    confirmAsk: (cfg) => askConfirm(cfg),
    setFull: (f) => { document.getElementById('workplace').classList.toggle('workplace-full', f); renderWorkplace(); },
    resetDesign: () => { state.design = null; renderWorkplace(); syncChatCard(); },
  };
}

// ---------------------------------------------- editable, draggable sections ---
function blocksEditorHTML(content) {
  const blocks = String(content || '').split('\n\n');
  return `<div class="block-hint">Drag the \u22EE\u22EE handle to reorder sections. Click any text to edit it.</div>
  <div class="block-list" id="blockList">${blocks.map((b, i) => `
    <div class="block-item" data-i="${i}">
      <button type="button" class="block-handle" draggable="true" title="Drag to move" aria-label="Drag to reorder section">\u22EE\u22EE</button>
      <textarea class="block-text" rows="1" aria-label="Section ${i + 1}">${esc(b)}</textarea>
      <div class="block-tools">
        <button type="button" data-bact="up" title="Move up" aria-label="Move section up">\u2191</button>
        <button type="button" data-bact="down" title="Move down" aria-label="Move section down">\u2193</button>
        <button type="button" data-bact="del" title="Delete section" aria-label="Delete section">\u00D7</button>
      </div>
    </div>`).join('')}
  </div>
  <button type="button" class="block-add" id="blockAdd">+ Add section</button>`;
}

function applyBlocks(arr, rerender) {
  state.draftContent = arr.join('\n\n');
  const chatArea = document.getElementById('chatDraftTextarea');
  if (chatArea) chatArea.value = state.draftContent;
  if (state.activeId) setDirty(true);
  if (rerender) renderWorkplace();
}

function autosizeBlock(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }

function bindBlocksEditor() {
  const list = document.getElementById('blockList');
  if (!list) return;
  const values = () => Array.from(list.querySelectorAll('.block-text')).map((t) => t.value);
  list.querySelectorAll('.block-text').forEach((t) => {
    autosizeBlock(t);
    t.addEventListener('input', () => { autosizeBlock(t); applyBlocks(values(), false); });
  });
  list.querySelectorAll('[data-bact]').forEach((btn) => btn.addEventListener('click', () => {
    const i = Number(btn.closest('.block-item').dataset.i);
    const arr = values();
    if (btn.dataset.bact === 'up' && i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; }
    else if (btn.dataset.bact === 'down' && i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; }
    else if (btn.dataset.bact === 'del') { arr.splice(i, 1); if (!arr.length) arr.push(''); }
    else return;
    applyBlocks(arr, true);
  }));
  const add = document.getElementById('blockAdd');
  if (add) add.onclick = () => {
    applyBlocks(values().concat(['']), true);
    const all = document.querySelectorAll('#blockList .block-text');
    if (all.length) all[all.length - 1].focus();
  };

  // drag and drop
  let from = null;
  const clearMarks = () => list.querySelectorAll('.block-item').forEach((el) => el.classList.remove('dragging', 'drop-before', 'drop-after'));
  list.querySelectorAll('.block-handle').forEach((h) => {
    h.addEventListener('dragstart', (e) => {
      const item = h.closest('.block-item');
      from = Number(item.dataset.i);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(from));
      try { e.dataTransfer.setDragImage(item, 12, 12); } catch (err) { /* ignore */ }
      setTimeout(() => item.classList.add('dragging'), 0);
    });
    h.addEventListener('dragend', () => { from = null; clearMarks(); });
  });
  list.querySelectorAll('.block-item').forEach((item) => {
    item.addEventListener('dragover', (e) => {
      if (from === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const r = item.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      list.querySelectorAll('.block-item').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
      item.classList.add(before ? 'drop-before' : 'drop-after');
    });
    item.addEventListener('drop', (e) => {
      if (from === null) return;
      e.preventDefault();
      const r = item.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      let to = Number(item.dataset.i) + (before ? 0 : 1);
      const arr = values();
      const [moved] = arr.splice(from, 1);
      if (to > from) to -= 1;
      arr.splice(to, 0, moved);
      from = null;
      clearMarks();
      applyBlocks(arr, true);
    });
  });
}

function paperOptionsHTML() {
  return Object.entries(Designer.PAPERS).map(([k, v]) => `<option value="${k}">${esc(v[2])}</option>`).join('');
}

// Paper size applies straight away: the preview re-lays out and PDF / Word export use the same size.
function changePaper(key) {
  state.form.paperSize = Designer.PAPERS[key] ? key : 'letter';
  if (state.activeId) setDirty(true);
  renderWorkplace();
  syncChatCard();
}

// Hide the chat so the document gets the whole screen. The edit controls only show in this mode.
function setChatHidden(hidden) {
  const frame = document.querySelector('.app-frame');
  frame.classList.toggle('chat-collapsed', hidden);
  const hint = document.getElementById('wpHint');
  if (hint) hint.textContent = '';
  Designer.setWide(hidden);
  const panel = document.getElementById('workplace');
  if (panel) { panel.style.width = ''; panel.style.minWidth = ''; }
  renderWorkplace();
}

function syncDocControls() {
  const hasDoc = Boolean(activeDocument() || state.draftType);
  const chatGone = document.querySelector('.app-frame').classList.contains('chat-collapsed');
  const fabWrap = document.getElementById('dlFabWrap'); if (fabWrap) fabWrap.style.display = (hasDoc && !chatGone) ? '' : 'none';
}

function renderWpActions() {
  const bar = document.getElementById('wpActions'); if (!bar) return;
  const hasDoc = Boolean(activeDocument() || state.draftType);
  if (!hasDoc) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  const collapsed = document.querySelector('.app-frame').classList.contains('chat-collapsed');
  let saveRow = '';
  if (!state.editingSaved && !collapsed) {
    saveRow = state.activeId
      ? `<button class="save-inline" data-act="save-existing" ${state.dirty ? '' : 'disabled'}>${icon('check', 12)} ${state.dirty ? 'Save changes' : 'Saved'}</button>`
      : `<button class="discard-inline" data-act="discard">${icon('x', 12)} Don't save</button><button class="save-inline" data-act="save">${icon('check', 12)} Save</button>`;
  }
  const tools = [`<button data-act="edit-info">${icon('pen', 12)} Edit info</button>`, `<button data-act="change-template">${icon('layout', 12)} Change template</button>`];
  if (!collapsed) tools.push(`<button data-act="suggest">${icon('sparkles', 12)} Suggest improvements</button>`, `<button data-act="review">${icon('clipboard', 12)} Review</button>`);
  bar.style.display = '';
  bar.innerHTML = `<div class="ga-row ga-tools" style="grid-template-columns:repeat(${tools.length},minmax(0,1fr))">${tools.join('')}</div>${saveRow ? `<div class="ga-row ga-save">${saveRow}</div>` : ''}`;
  const on = (act, fn) => { const b = bar.querySelector(`[data-act="${act}"]`); if (b) b.onclick = fn; };
  on('edit-info', () => { state.modal = 'edit'; renderModal(); });
  on('change-template', () => { state.modal = 'gallery'; renderModal(); });
  on('suggest', () => requestSuggestions());
  on('review', () => reviewCurrentDocument());
  on('discard', () => askConfirm({
    title: 'Discard this document?',
    text: 'This document has not been saved yet. If you choose Don\u2019t save, it will be deleted and cannot be recovered.',
    cancelLabel: 'Go back', confirmLabel: 'Don\u2019t save', icon: 'x', danger: true,
    onConfirm: discardDraft,
  }));
  on('save', saveDraft);
  on('save-existing', saveExistingNow);
}

function renderWorkplace() {
  const el = document.getElementById('workplaceScroll');
  const hasDoc = Boolean(activeDocument() || state.draftType);
  syncDocControls();
  renderWpActions();
  if (!hasDoc) {
    el.classList.remove('dz-host');
    const wpPanel = document.getElementById('workplace'); if (wpPanel) { wpPanel.style.width = ''; wpPanel.style.minWidth = ''; }
    el.innerHTML = `<div class="workplace-empty">${icon('file-text', 26)}<strong>Nothing to preview yet</strong><span>Generate a document in Chat and it will appear here, live.</span></div>`;
    return;
  }
  ensureDesign();
  el.classList.add('dz-host');
  Designer.mount(el, designCtx());
}

// ---------------------------------------------------------------- modals ---
function fieldHTML(f, value) {
  const req = f.key === 'name';
  if (f.photo) {
    return `<label class="field photo-field wide"><span>${esc(f.label)}</span><input type="file" accept="image/*" data-photo-field="${f.key}" />${value ? `<img src="${value}" alt="Selected profile preview" />` : ''}</label>`;
  }
  if (f.textarea) {
    return `<label class="field ${f.wide ? 'wide' : ''}"><span>${esc(f.label)}</span><textarea rows="3" data-field="${f.key}">${esc(value)}</textarea></label>`;
  }
  return `<label class="field ${f.wide ? 'wide' : ''}"><span>${esc(f.label)}${req ? ' <em>*</em>' : ''}</span><input data-field="${f.key}" value="${esc(value)}" /></label>`;
}

function bindFormFields(container, formRef, onPhotoLoaded) {
  container.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', () => { formRef[input.dataset.field] = input.value; refreshGenerateButton(); });
  });
  container.querySelectorAll('[data-photo-field]').forEach((input) => {
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { formRef[input.dataset.photoField] = typeof reader.result === 'string' ? reader.result : ''; if (onPhotoLoaded) onPhotoLoaded(); };
      reader.readAsDataURL(file);
    });
  });
}
function refreshGenerateButton() {
  const btn = document.getElementById('generateBtn');
  if (btn) btn.disabled = !state.form.name.trim() || !hasMeaningfulFormData(state.form);
}

function renderModal() {
  const mount = document.getElementById('modalRoot');
  if (!state.modal) { mount.innerHTML = ''; return; }

  if (state.modal === 'create' || state.modal === 'edit') {
    const isCreate = state.modal === 'create';
    const type = isCreate ? state.selectedType : ((activeDocument() && activeDocument().type) || state.draftType || 'resume');
    const fields = FIELDS_BY_TYPE[type] || [];
    mount.innerHTML = `<div class="modal-backdrop" id="backdrop"><div class="form-modal" role="dialog" aria-modal="true">
      <div class="modal-header"><div><p class="eyebrow">DocuAI assistant</p><h2>${isCreate ? 'Create a new document' : `Edit ${esc(TYPE_LABELS[type] || 'document')} information`}</h2></div><button id="closeModal">${icon('x', 18)}</button></div>
      ${!isCreate ? `<p class="modal-description">Update the source information without losing the draft you already created.</p>` : ''}
      ${isCreate ? `<div class="modal-step"><label>Document type</label><select id="typeSelect">${DOCUMENT_CHOICES.map((c) => `<option value="${c.value}" ${c.value === type ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>` : ''}
      <div class="form-grid" id="formGrid">
        ${fieldHTML({ key: 'name', label: 'Your full name' }, state.form.name)}
        ${fieldHTML({ key: 'email', label: 'Email address' }, state.form.email)}
        ${fieldHTML({ key: 'phone', label: 'Phone number' }, state.form.phone)}
        ${fieldHTML({ key: 'location', label: 'City, country' }, state.form.location)}
        ${fields.map((f) => fieldHTML(f, state.form[f.key] || '')).join('')}
      </div>
      <div class="modal-actions">
        <button class="button-secondary" id="cancelModal">Cancel</button>
        ${isCreate
          ? `<button class="button-primary" id="generateBtn">${icon('sparkles', 14)} Generate draft</button>`
          : `<button class="button-primary" id="applyInfoBtn">${icon('check', 14)} Apply information</button>`}
      </div>
    </div></div>`;

    document.getElementById('closeModal').onclick = () => { state.modal = null; renderModal(); };
    document.getElementById('cancelModal').onclick = () => { state.modal = null; renderModal(); };
    document.getElementById('backdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'backdrop') { state.modal = null; renderModal(); } });
    if (isCreate) {
      document.getElementById('typeSelect').onchange = (e) => { state.selectedType = e.target.value; renderModal(); };
      document.getElementById('generateBtn').onclick = generateDraft;
    } else {
      document.getElementById('applyInfoBtn').onclick = saveInfo;
    }
    bindFormFields(document.getElementById('formGrid'), state.form, () => renderModal());
    refreshGenerateButton();
  }

  else if (state.modal === 'gallery') {
    const type = (activeDocument() && activeDocument().type) || state.draftType || 'resume';
    const miniLines = String(state.draftContent || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const mini = { head: (miniLines[0] || 'SUMMARY').slice(0, 26), snippet: miniLines.slice(1).join(' ').slice(0, 58) || (state.form.targetRole || '') };
    mount.innerHTML = `<div class="modal-backdrop"><div class="gallery-modal">
      <div class="gallery-header"><div><p class="eyebrow">Template gallery</p><h2>Choose a ${esc(TYPE_LABELS[type] || 'document')} layout</h2><span>${TEMPLATES.length} distinct styles \u00B7 Your information stays in every preview</span></div><button id="closeGallery">${icon('x', 18)}</button></div>
      <div class="template-grid">
        ${TEMPLATES.map((t) => `
        <button class="template-option ${state.draftTemplate === t.id ? 'chosen' : ''}" data-tpl="${t.id}">
          <div class="template-mini ${templateArchetype(t.id)}" style="${templateVarsStyle(t)}">
            <strong>${esc((state.form.name || '').trim() || 'Your name')}</strong>
            <span></span><i></i><i></i>
            <b>${esc(mini.head)}</b>
            <small>${esc(mini.snippet)}</small>
          </div>
          <div class="template-name"><span>${esc(t.name)}</span>${state.draftTemplate === t.id ? icon('check', 13) : ''}</div>
        </button>`).join('')}
      </div>
    </div></div>`;
    document.getElementById('closeGallery').onclick = () => { state.modal = null; renderModal(); };
    mount.querySelectorAll('[data-tpl]').forEach((btn) => btn.onclick = () => chooseTemplate(btn.dataset.tpl));
  }

  else if (state.modal === 'rename') {
    const doc = state.documents.find((d) => d.id === state.renameTargetId);
    if (!doc) { state.modal = null; mount.innerHTML = ''; return; }
    mount.innerHTML = `<div class="modal-backdrop" id="renameBackdrop"><div class="confirm-modal" role="dialog" aria-modal="true">
      <div class="delete-mark" style="color:var(--purple);background:var(--violet-soft)">${icon('pen', 19)}</div>
      <h2>Rename document</h2>
      <p>Choose a new name for this saved document.</p>
      <div class="field" style="margin-top:12px"><input id="renameInput" type="text" maxlength="120" value="${esc(doc.title)}" aria-label="Document name" /></div>
      <div class="modal-actions"><button class="button-secondary" id="renameCancel">Cancel</button><button class="button-primary" id="renameSave">${icon('check', 15)} Save name</button></div>
    </div></div>`;
    const input = document.getElementById('renameInput'), saveBtn = document.getElementById('renameSave');
    const close = () => { state.modal = null; state.renameTargetId = null; renderModal(); };
    const sync = () => { saveBtn.disabled = !input.value.trim(); };
    const submit = async () => { if (saveBtn.disabled) return; saveBtn.disabled = true; const id = doc.id; const ok = await renameDocument(id, input.value); if (ok) close(); else sync(); };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } else if (e.key === 'Escape') close(); });
    document.getElementById('renameCancel').onclick = close;
    saveBtn.onclick = submit;
    document.getElementById('renameBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'renameBackdrop') close(); });
    input.focus(); input.select();
    sync();
  }

  else if (state.modal === 'delete') {
    mount.innerHTML = `<div class="modal-backdrop"><div class="confirm-modal">
      <div class="delete-mark">${icon('trash', 19)}</div>
      <h2>Delete this document?</h2>
      <p>\u201C${esc(state.deleteTargetTitle || 'This document')}\u201D will be permanently removed from your saved documents.</p>
      <div class="modal-actions"><button class="button-secondary" id="cancelDelete">Cancel</button><button class="button-danger" id="confirmDelete">${icon('trash', 15)} Delete permanently</button></div>
    </div></div>`;
    document.getElementById('cancelDelete').onclick = () => { state.modal = null; renderModal(); };
    document.getElementById('confirmDelete').onclick = removeDocument;
  }

  else if (state.modal === 'clear') {
    const hasDraft = Boolean(state.draftType || state.activeId);
    mount.innerHTML = `<div class="modal-backdrop" id="clearBackdrop"><div class="confirm-modal" role="dialog" aria-modal="true">
      <div class="delete-mark">${icon('trash', 19)}</div>
      <h2>Clear this chat?</h2>
      <p>Your conversation messages will be wiped.${hasDraft ? ' The document in the live preview stays as it is.' : ''} Documents you already saved stay safe in My Documents.</p>
      <div class="modal-actions"><button class="button-secondary" id="cancelClear">Keep chatting</button><button class="button-danger" id="confirmClear">${icon('trash', 15)} Clear chat</button></div>
    </div></div>`;
    document.getElementById('cancelClear').onclick = () => { state.modal = null; renderModal(); };
    document.getElementById('confirmClear').onclick = clearChat;
    document.getElementById('clearBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'clearBackdrop') { state.modal = null; renderModal(); } });
  }

  else if (state.modal === 'newdoc') {
    const label = TYPE_LABELS[state.pendingType] || 'document';
    const unsaved = Boolean((state.draftType && !state.activeId) || state.dirty);
    mount.innerHTML = `<div class="modal-backdrop" id="newDocBackdrop"><div class="confirm-modal" role="dialog" aria-modal="true">
      <div class="delete-mark" style="color:#5b4bd5;background:#efedff">${icon('file-text', 19)}</div>
      <h2>Create a new document?</h2>
      <p>You already have a document in the live preview. Starting a ${esc(label.toLowerCase())} will replace it.${unsaved ? ' Your unsaved changes will be discarded.' : ' Anything you saved stays in My Documents.'}</p>
      <div class="modal-actions"><button class="button-secondary" id="cancelNewDoc">Keep current</button><button class="button-primary" id="confirmNewDoc">${icon('plus', 15)} Create new</button></div>
    </div></div>`;
    const close = () => { state.modal = null; state.pendingType = null; renderModal(); };
    document.getElementById('cancelNewDoc').onclick = close;
    document.getElementById('confirmNewDoc').onclick = () => { const t = state.pendingType; state.pendingType = null; startCreate(t); };
    document.getElementById('newDocBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'newDocBackdrop') close(); });
  }

  else if (state.modal === 'confirm' && state.confirmCfg) {
    const c = state.confirmCfg;
    mount.innerHTML = `<div class="modal-backdrop" id="confirmBackdrop"><div class="confirm-modal" role="dialog" aria-modal="true">
      <div class="delete-mark">${icon(c.icon || 'x', 19)}</div>
      <h2>${esc(c.title)}</h2>
      <p>${esc(c.text)}</p>
      <div class="modal-actions"><button class="button-secondary" id="confirmNo">${esc(c.cancelLabel || 'Cancel')}</button><button class="${c.danger ? 'button-danger' : 'button-primary'}" id="confirmYes">${esc(c.confirmLabel || 'Confirm')}</button></div>
    </div></div>`;
    const close = () => { state.modal = null; state.confirmCfg = null; renderModal(); };
    document.getElementById('confirmNo').onclick = close;
    document.getElementById('confirmYes').onclick = () => { const fn = c.onConfirm; close(); if (fn) fn(); };
    document.getElementById('confirmBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'confirmBackdrop') close(); });
  }

  else if (state.modal === 'how') {
    const steps = ['Choose a document type', 'Enter only your information', 'Generate an unsaved document draft', 'Edit the content or change the template in Chat', 'Preview the same live draft in Workplace', 'Choose Save to keep it (I\u2019ll then ask what to make next) or Don\u2019t save to discard it'];
    mount.innerHTML = `<div class="modal-backdrop" id="howBackdrop"><div class="how-modal">
      <div class="modal-header"><div><p class="eyebrow">DocuAI workflow</p><h2>How it works</h2></div><button id="closeHow">${icon('x', 18)}</button></div>
      <div class="how-steps">${steps.map((s, i) => `<div class="how-step"><span>${i + 1}</span><p>${esc(s)}</p></div>`).join('')}</div>
      <button class="button-primary how-close" id="gotIt">Got it</button>
    </div></div>`;
    document.getElementById('closeHow').onclick = () => { state.modal = null; renderModal(); };
    document.getElementById('gotIt').onclick = () => { state.modal = null; renderModal(); };
    document.getElementById('howBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'howBackdrop') { state.modal = null; renderModal(); } });
  }

  else if (state.modal === 'saved') {
    const doc = state.documents.find((d) => d.id === state.savedPreviewId);
    if (!doc) { state.modal = null; mount.innerHTML = ''; return; }
    const info = inferForm(doc.info);
    const hasDesign = Boolean(doc.info && doc.info.design && Array.isArray(doc.info.design.els));
    mount.innerHTML = `<div class="modal-backdrop" id="savedBackdrop"><div class="saved-preview-modal">
      <div class="saved-preview-header"><div><p class="eyebrow">Saved document</p><h2>${esc(doc.title)}</h2></div><button id="closeSaved">${icon('x', 18)}</button></div>
      <div class="saved-preview-scroll">${hasDesign ? '<div id="savedDesign"></div>' : documentSurfaceHTML({ info, docType: doc.type, content: doc.content, templateId: doc.templateId || 'template-1', editable: false, idPrefix: 'savedPreviewTextarea' })}</div>
      <div class="saved-preview-actions">
        <button class="button-primary" id="savedEdit">${icon('pen', 15)} Edit</button>
        <button class="button-primary" id="savedPdf">${icon('download', 15)} Download PDF</button>
        <button class="button-primary" id="savedDocx">${icon('download', 15)} Download DOCX</button>
      </div>
    </div></div>`;
    if (hasDesign) Designer.renderStatic(document.getElementById('savedDesign'), doc.info.design, doc.info);
    document.getElementById('closeSaved').onclick = () => { state.modal = null; state.savedPreviewId = null; renderModal(); };
    document.getElementById('savedBackdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'savedBackdrop') { state.modal = null; state.savedPreviewId = null; renderModal(); } });
    document.getElementById('savedEdit').onclick = () => { state.modal = null; state.savedPreviewId = null; renderModal(); editSavedDocument(doc.id); };
    document.getElementById('savedPdf').onclick = () => downloadExport('pdf', doc);
    document.getElementById('savedDocx').onclick = () => downloadExport('docx', doc);
  }
}

// document.addEventListener click-away for row menu popovers
document.addEventListener('click', (e) => {
  if (state.openMenuId !== null && !e.target.closest('.document-row')) { state.openMenuId = null; renderSidebar(); }
});

// ------------------------------------------------------------------ boot ---
async function boot() {
  try {
    const res = await fetch('/static/templates.json');
    TEMPLATES = await res.json();
  } catch (e) { TEMPLATES = []; }
  init();
  loadAccount();
  await loadDocuments();
}

// ------------------------------------------------------------- account ---
async function loadAccount() {
  try {
    const data = await apiFetch('/api/auth/me');
    const user = data && data.user;
    const slot = document.getElementById('accountSlot');
    if (!user || !slot) return;
    slot.innerHTML = `<div class="account-chip"><div class="account-avatar">${esc((user.name || '?').trim().charAt(0).toUpperCase())}</div><div class="account-copy"><strong>${esc(user.name)}</strong><span>${esc(user.email)}</span></div><button class="account-logout" id="logoutBtn">Log out</button></div>`;
    document.getElementById('logoutBtn').onclick = async () => {
      try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
      window.location.href = '/login';
    };
  } catch (e) { /* not logged in: apiFetch already redirects */ }
}
boot();
