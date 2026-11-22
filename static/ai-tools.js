// Suggest improvements + Review document. Results appear in the chat (message part);
// nothing changes in the document until the user presses Apply.
function aiDocType() { return (activeDocument() && activeDocument().type) || state.draftType || null; }
// The text Suggest/Review work on: the draft text, or (when the draft text is empty because the user
// typed straight into the preview) the text boxes on the page itself.
function designTextEls() {
  const d = state.design;
  return d && Array.isArray(d.els) ? d.els.filter((e) => e.kind === 'text' && !e.linked && String(e.text || '').trim()).sort((a, b) => (a.y - b.y) || (a.x - b.x)) : [];
}
function suggestFromDesign() { return !String(state.draftContent || '').trim(); }
function currentSuggestText() {
  if (!suggestFromDesign()) return String(state.draftContent);
  return designTextEls().map((e) => String(e.text).replace(/\s+$/g, '')).join('\n\n');
}
function aiKey() { return `${state.activeId || 'draft'}|${aiDocType()}`; }
function aiFormKey() {
  const f = Object.assign({}, state.form);
  ['photoData', 'photoSourceData', 'photoCrop', 'signatureData'].forEach((k) => { delete f[k]; });
  return JSON.stringify(f);
}
function aiFormPayload() {
  const f = Object.assign({}, state.form);
  ['photoData', 'photoSourceData', 'photoCrop', 'signatureData'].forEach((k) => { delete f[k]; });
  return f;
}
function resetAiPanel() {
  state.lastEdit = null;
  state.suggestionsBatch = null;
  state.suggestionsError = null;
  state.suggestionsClosed = false;
  state.suggestionRequest = null;
}
function ensureChatVisible() { /* suggestions now appear next to the document, so the editor stays open */ }
function chatIsHidden() { const f = document.querySelector('.app-frame'); return Boolean(f && f.classList.contains('chat-collapsed')); }
// When the chat is hidden (full-screen editing) the suggestions panel floats over the document instead.
function renderSuggestOverlay() {
  const stage = document.querySelector('.wp-stage'); if (!stage) return;
  let box = document.getElementById('wpSuggest');
  if (!chatIsHidden()) { if (box) box.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'wpSuggest'; box.className = 'wp-suggest'; stage.appendChild(box); }
  const busy = state.thinking ? '<div class="typing"><i></i><i></i><i></i></div>' : '';
  const html = busy + suggestionsPanelHTML();
  box.innerHTML = html;
  box.style.display = html ? '' : 'none';
}
function uniquePassage(text, passage) {
  const start = text.indexOf(passage);
  return passage && start >= 0 && start === text.lastIndexOf(passage) ? start : -1;
}
function suggestionsRelevant(batch) { return Boolean(batch) && batch.key === aiKey(); }
function suggestionsCurrent(batch) {
  return suggestionsRelevant(batch) && batch.content === currentSuggestText() && batch.form === aiFormKey();
}

async function requestSuggestions(instruction, userMessageAdded) {
  if (state.thinking) return;
  const type = aiDocType();
  if (!type || !currentSuggestText().trim()) { showToast('Add some text to your document first'); return; }
  instruction = instruction || 'Suggest improvements to wording and organization using my confirmed information.';
  ensureChatVisible();
  if (!userMessageAdded) state.messages.push({ role: 'user', text: 'Suggest improvements to my document.' });
  const request = { key: aiKey(), content: currentSuggestText(), form: aiFormKey(), anchor: state.messages.length };
  state.suggestionsClosed = false;
  state.suggestionsError = null;
  state.suggestionsBatch = null;   // never show the previous suggestions while new ones load
  state.suggestionRequest = request;
  state.thinking = true;
  renderChat();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const result = await apiFetch('/api/ai/suggestions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ type, content: request.content, info: aiFormPayload(), instruction }),
    });
    if (request.key !== aiKey()) return;
    if (request.content !== currentSuggestText() || request.form !== aiFormKey()) { showToast('The draft changed. Request suggestions again for the current version.'); return; }
    if (!Array.isArray(result && result.suggestions)) throw new Error('The AI did not return usable suggestions. Please retry.');
    state.suggestionsBatch = { key: request.key, anchor: request.anchor, content: request.content, form: request.form, instruction, items: result.suggestions.map((item) => Object.assign({}, item, { status: 'pending' })) };
    if (!result.suggestions.length) state.messages.push({ role: 'assistant', text: 'I did not find any supported improvements for this draft.' });
  } catch (error) {
    if (request.key === aiKey()) state.suggestionsError = { key: request.key, anchor: request.anchor, instruction, message: error.name === 'AbortError' ? 'The suggestion request timed out. Retry when the connection is stable.' : (error.message || 'Suggestions could not load.') };
  } finally {
    clearTimeout(timeout);
    if (state.suggestionRequest === request || !state.suggestionRequest) { state.suggestionRequest = null; state.thinking = false; renderChat(); }
  }
}

// "add a skill under EXPERIENCE", "remove the second paragraph", "change the summary to ..." typed in chat:
// the AI returns the edited document and it is applied to the live preview.
function looksLikeEditRequest(text) {
  const t = String(text || '');
  if (/\b(tip|tips|advice|how do i|how can i|how to|what if|why|explain|what is|what are)\b/i.test(t) && !/\b(add|insert|remove|delete|replace)\b[^?]*\b(under|below|after|before|above|to my|to the|in the)\b/i.test(t)) return false;
  return /\b(add|insert|put|append|include|remove|delete|erase|replace|change|update|edit|modify|move|swap|fix|reword|rephrase|shorten|expand|rewrite|improve|correct|capitalize|translate)\b/i.test(t)
    || /\b(under|below|beneath|after|before|above)\s+(the\s+)?[a-z]/i.test(t) && /\b(this|that|it|here|there)\b/i.test(t);
}

async function editDocumentWithAI(instruction) {
  const type = aiDocType();
  const before = currentSuggestText();
  if (!type || !before.trim()) {
    state.messages.push({ role: 'assistant', text: 'There is no text in the document yet. Add or generate some text first, then ask me to change it.' });
    state.thinking = false; renderChat(); return;
  }
  const key = aiKey();
  state.thinking = true;
  renderChat();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const result = await apiFetch('/api/ai/edit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ type, content: before, instruction }),
    });
    if (key !== aiKey()) return;
    if (!result || typeof result.content !== 'string') throw new Error('The AI did not return an edit.');
    if (!result.changed || result.content.trim() === before.trim()) {
      state.messages.push({ role: 'assistant', text: (result.summary || 'I could not find where to make that change.') + ' Nothing was changed in the document.' });
    } else {
      state.lastEdit = { key, before };
      state.draftContent = result.content;
      if (state.activeId) setDirty(true);
      state.messages.push({ role: 'assistant', text: 'Done \u2014 ' + String(result.summary || 'I updated your document.').replace(/^done\W*/i, '') + (state.activeId ? ' Save to keep the change.' : '') });
    }
  } catch (error) {
    if (key === aiKey()) state.messages.push({ role: 'assistant', text: (error.name === 'AbortError' ? 'The edit timed out.' : (error.message || 'The edit could not be made.')) + ' Your document is unchanged.' });
  } finally {
    clearTimeout(timeout);
    state.thinking = false;
    renderChat();
    renderWorkplace();
  }
}

// ------------------------------------------------------------ quick chat buttons ---
const TONES = [
  ['Formal', 'formal and professional'],
  ['Friendly', 'friendly and approachable'],
  ['Confident', 'confident and assertive, without exaggerating'],
  ['Warm', 'warm and sincere'],
];
let quickChipList = [];

function quickChipsFor(type) {
  const isLetter = Boolean(type) && type.endsWith('-letter');
  const chips = [];
  if (isLetter) {
    TONES.forEach(([label, words]) => chips.push({
      group: 'Tone', label, say: `Make the tone ${label.toLowerCase()}.`,
      run: `Rewrite the whole letter in a ${words} tone. Keep every fact, the salutation, the closing line and the signature name exactly the same.`,
    }));
  }
  chips.push(
    { group: 'Quick edits', label: 'Shorten', say: 'Shorten my document.', run: 'Shorten the document by tightening the wording and removing repetition. Keep every key fact and every section heading.' },
    { group: 'Quick edits', label: 'Fix grammar', say: 'Fix the grammar in my document.', run: 'Fix spelling, grammar and punctuation mistakes only. Do not change the meaning, the order or add anything.' },
    { group: 'Quick edits', label: 'Stronger wording', say: 'Make the wording stronger.', run: 'Make the wording stronger and more professional using strong action verbs. Do not add any new fact, number or claim.' },
  );
  if (isLetter) chips.push({ group: 'Quick edits', label: 'Add paragraph', fill: 'Add a paragraph about ' });
  else if (type) chips.push(
    { group: 'Quick edits', label: 'Add skills', fill: 'Add these skills under SKILLS: ' },
    { group: 'Quick edits', label: 'Add summary', fill: 'Add this professional summary at the top: ' },
  );
  return chips;
}

function renderQuickChips() {
  const host = document.getElementById('quickChips'); if (!host) return;
  const hasDoc = Boolean(activeDocument() || state.draftType);
  if (!hasDoc) { host.innerHTML = ''; quickChipList = []; return; }
  quickChipList = quickChipsFor(aiDocType());
  let html = '', group = null;
  quickChipList.forEach((c, i) => {
    if (c.group !== group) { group = c.group; html += `<span class="qc-label">${esc(group)}</span>`; }
    html += `<button type="button" class="qc-chip" data-qc="${i}" ${state.thinking ? 'disabled' : ''}>${esc(c.label)}</button>`;
  });
  host.innerHTML = html;
  host.querySelectorAll('[data-qc]').forEach((b) => { b.onclick = () => runQuickChip(Number(b.dataset.qc)); });
}

function runQuickChip(index) {
  const chip = quickChipList[index];
  if (!chip || state.thinking) return;
  if (chip.fill) {
    const ta = document.getElementById('composerInput'), send = document.getElementById('sendBtn');
    state.composer = chip.fill;
    if (ta) { ta.value = chip.fill; ta.focus(); ta.setSelectionRange(chip.fill.length, chip.fill.length); }
    if (send) send.disabled = false;
    return;
  }
  state.messages.push({ role: 'user', text: chip.say });
  editDocumentWithAI(chip.run);
}

// ------------------------------------------------------------------ import a file ---
async function importFile(file) {
  if (!file) return;
  if (state.thinking) { showToast('Wait for the current request to finish'); return; }
  if (state.editingSaved) { showToast('Save or cancel your edit before importing a file'); return; }
  if (file.size > 5 * 1024 * 1024) { state.messages.push({ role: 'assistant', text: 'That file is larger than 5 MB. Upload a smaller PDF, Word (.docx) or text file.' }); renderChat(); return; }
  state.messages.push({ role: 'user', text: `Import my file: ${file.name}` });
  state.thinking = true;
  renderChat();
  try {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/import', { method: 'POST', body });
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw new Error((data && data.error) || 'The file could not be imported.');
    state.thinking = false;
    if (state.draftType || state.activeId || state.dirty) {
      renderChat();
      askConfirm({
        title: 'Replace the document in the live preview?',
        text: `Importing \u201C${file.name}\u201D will replace the document you are working on.${state.dirty || (state.draftType && !state.activeId) ? ' Unsaved changes will be discarded.' : ' Anything you saved stays in My Documents.'}`,
        cancelLabel: 'Keep current', confirmLabel: 'Import', icon: 'upload', danger: false,
        onConfirm: () => applyImport(data, file.name),
      });
      return;
    }
    applyImport(data, file.name);
  } catch (error) {
    state.thinking = false;
    state.messages.push({ role: 'assistant', text: (error.message || 'The file could not be imported.') + ' Your current document is unchanged.' });
    renderChat();
  }
}

function applyImport(data, filename) {
  resetAiPanel();
  const type = TYPE_LABELS[data.type] ? data.type : 'resume';
  const label = TYPE_LABELS[type];
  const form = emptyForm();
  ['name', 'email', 'phone', 'location'].forEach((k) => { form[k] = String(data[k] || ''); });
  form.generationSource = 'import';
  state.selectedType = type;
  state.form = form;
  state.activeId = null;
  state.draftType = type;
  const base = String(filename || 'Imported document').replace(/\.[^.]+$/, '');
  state.draftTitle = `${form.name || base} \u2014 ${label}`;
  state.draftContent = String(data.content || '');
  state.draftTemplate = 'template-1';
  state.design = null;
  state.dirty = false;
  state.messages.push({ role: 'assistant', text: `I imported \u201C${filename}\u201D as a ${label.toLowerCase()} and put it in the live preview${data.source === 'ai' ? '' : ' (the AI is not connected, so I only organised the section headings)'}. Check that the name, contact details and sections look right. You can edit it in the preview, ask me to change it here, or pick a template. It is an unsaved draft until you press Save.` });
  showToast('File imported \u2014 save it if you want to keep it');
  renderChat();
  renderWorkplace();
}

async function reviewCurrentDocument(userMessageAdded) {
  if (state.thinking) return;
  const type = aiDocType();
  if (!type || !currentSuggestText().trim()) { showToast('Add some text to your document first'); return; }
  ensureChatVisible();
  if (!userMessageAdded) state.messages.push({ role: 'user', text: 'Review my document.' });
  const key = aiKey(), content = currentSuggestText();
  state.thinking = true;
  renderChat();
  try {
    const result = await apiFetch('/api/ai/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, content, info: aiFormPayload() }) });
    if (key === aiKey()) {
      const issues = (result && result.issues) || [];
      state.messages.push({ role: 'assistant', focus: true, text: 'Document review (structure and completeness):\n\n' + (issues.length ? issues.map((x, i) => `${i + 1}. ${x}`).join('\n') : 'No structural issues found.') + (result && result.note ? '\n\n' + result.note : '') });
    }
  } catch (e) {
    if (key === aiKey()) state.messages.push({ role: 'assistant', text: 'The document review could not run. Your draft is unchanged; try again.' });
  } finally {
    state.thinking = false;
    renderChat();
  }
}

function suggestionsPanelHTML() {
  if (state.suggestionsClosed) return '';
  const batch = state.suggestionsBatch, error = state.suggestionsError;
  const relevant = suggestionsRelevant(batch), failed = Boolean(error) && error.key === aiKey();
  if ((!relevant || !batch.items.length) && !failed) return '';
  const cards = relevant ? batch.items.map((item, i) => {
    let body;
    if (item.status === 'dismissed') body = '<p class="sg-state">Dismissed</p>';
    else if (item.kind === 'question') {
      body = `<p class="sg-question">${esc(item.question)}</p><p class="sg-help">Add your actual facts in Edit info, then refresh suggestions. Nothing is inserted from this question.</p>
        <div class="sg-actions"><button type="button" data-sg-facts="${i}">${icon('pen', 11)} Add missing facts</button><button type="button" class="sg-ghost" data-sg-dismiss="${i}">Dismiss</button></div>`;
    } else {
      body = `<div class="sg-compare"><section><h5>Current wording</h5><pre>${esc(item.original)}</pre></section><section class="sg-new"><h5>Suggested wording</h5><pre>${esc(item.replacement)}</pre></section></div>
        <p class="sg-state">${item.status === 'applied' ? 'Applied' : item.status === 'undone' ? 'Undone' : 'Ready for review'}</p>
        <div class="sg-actions">${item.status === 'applied'
          ? `<button type="button" data-sg-undo="${i}">Undo</button>`
          : `<button type="button" class="sg-apply" data-sg-apply="${i}">${icon('check', 11)} Apply</button><button type="button" class="sg-ghost" data-sg-dismiss="${i}">Dismiss</button>`}</div>`;
    }
    return `<article class="sg-card"><h4>${esc(item.title)}</h4><p>${esc(item.reason)}</p>${body}</article>`;
  }).join('') : '';
  return `<div class="sg-wrap"><section class="sg-panel" id="suggestionsPanel">
    <div class="sg-head"><span class="sg-title">${icon('sparkles', 13)} AI suggestions</span>
      <button type="button" data-sg-refresh ${state.thinking ? 'disabled' : ''}>${failed ? 'Retry' : 'Refresh'}</button><button type="button" class="sg-ghost" data-sg-close>Close</button></div>
    <p class="sg-note">Check every factual claim before applying. Save to keep accepted edits.</p>
    ${failed ? `<p class="sg-error" role="alert">${esc(error.message)} Your document is unchanged.</p>` : ''}
    ${relevant ? `<p class="sg-error" data-sg-stale ${suggestionsCurrent(batch) ? 'hidden' : ''}>The document changed. Refresh suggestions before applying or undoing.</p>` : ''}
    ${cards}</section></div>`;
}

function updateSuggestionControls() {
  const panel = document.getElementById('suggestionsPanel'); if (!panel) return;
  const batch = state.suggestionsBatch, current = suggestionsCurrent(batch);
  const stale = panel.querySelector('[data-sg-stale]'); if (stale) stale.hidden = current;
  panel.querySelectorAll('[data-sg-apply],[data-sg-undo],[data-sg-facts]').forEach((b) => {
    b.disabled = state.thinking || !current;
    if (b.hasAttribute('data-sg-undo') && current) {
      const item = batch.items[Number(b.dataset.sgUndo)];
      b.disabled = uniquePassage(currentSuggestText(), item.replacement) < 0;
    }
  });
}

function changeSuggestion(index, undo) {
  const batch = state.suggestionsBatch, item = batch && batch.items[index];
  if (!item || item.kind !== 'edit' || state.thinking || !suggestionsCurrent(batch)) { showToast('The draft changed. Refresh suggestions first.'); updateSuggestionControls(); return; }
  if (undo ? item.status !== 'applied' : !['pending', 'undone'].includes(item.status)) return;
  const from = undo ? item.replacement : item.original, to = undo ? item.original : item.replacement;
  const text = currentSuggestText();
  const start = uniquePassage(text, from);
  if (start < 0) { showToast('This passage is no longer unique. Refresh suggestions.'); return; }
  const after = text.slice(0, start) + to + text.slice(start + from.length);
  if (suggestFromDesign()) {
    // text lives in the page's own text boxes: change the one box that holds this passage
    const holders = designTextEls().filter((e) => String(e.text).includes(from));
    if (holders.length !== 1) { showToast('This passage spans several text boxes. Edit it by hand.'); return; }
    holders[0].text = String(holders[0].text).replace(from, to);
  } else {
    state.draftContent = after;
  }
  batch.content = after;
  item.status = undo ? 'undone' : 'applied';
  if (state.activeId) setDirty(true);
  renderChat();
  renderWorkplace();
  showToast(undo ? 'Suggestion undone' : 'Suggestion applied \u2014 save to keep it');
}

function bindSuggestionCards() {
  const q = (s) => document.querySelector(s);
  const close = q('[data-sg-close]'); if (close) close.onclick = () => { state.suggestionsClosed = true; renderChat(); };
  const refresh = q('[data-sg-refresh]');
  if (refresh) refresh.onclick = () => requestSuggestions((state.suggestionsError && state.suggestionsError.instruction) || (state.suggestionsBatch && state.suggestionsBatch.instruction), true);
  ['apply', 'undo', 'dismiss', 'facts'].forEach((action) => document.querySelectorAll(`[data-sg-${action}]`).forEach((b) => {
    b.onclick = () => {
      const index = Number(b.getAttribute(`data-sg-${action}`)), batch = state.suggestionsBatch, item = batch && batch.items[index];
      if (!item) return;
      if (action === 'apply' || action === 'undo') { changeSuggestion(index, action === 'undo'); return; }
      if (action === 'dismiss') { item.status = 'dismissed'; renderChat(); return; }
      if (state.thinking || !suggestionsCurrent(batch)) return;
      state.modal = 'edit'; renderModal();
    };
  }));
  updateSuggestionControls();
}
