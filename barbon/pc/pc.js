(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const CFG = window.BARBON_REPO || {};
  const API = 'https://api.github.com';
  const MAX_BYTES = 20 * 1024 * 1024;
  const TOKEN_KEY = 'barbon_gh_token';

  let token = null;
  let signedIn = false;

  const configured = CFG.owner && CFG.repo && !/^YOUR-/.test(CFG.owner) && !/^YOUR-/.test(CFG.repo);

  // ---------- GitHub API ----------
  async function gh(path, opts) {
    const res = await fetch(API + path, Object.assign({}, opts, {
      headers: Object.assign({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + token,
        'X-GitHub-Api-Version': '2022-11-28',
      }, (opts && opts.headers) || {}),
    }));
    let body = {};
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error(body.message || 'GitHub returned an error (' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return body;
  }
  const repoPath = () => '/repos/' + encodeURIComponent(CFG.owner) + '/' + encodeURIComponent(CFG.repo);

  // Confirms the token is valid AND belongs to someone allowed to change this repository.
  async function checkAccess() {
    const repo = await gh(repoPath());
    if (!repo.permissions || !repo.permissions.push) {
      throw new Error('That token does not have permission to change this website.');
    }
    let name = 'GitHub user';
    try { name = (await gh('/user')).login; } catch (e) { /* token may not allow /user */ }
    return name;
  }

  // ---------- helpers ----------
  function el(tag, props, children) {
    const n = document.createElement(tag);
    Object.assign(n, props || {});
    (children || []).forEach((c) => n.append(c));
    return n;
  }
  function fmtDate(iso) {
    return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  function slug(title) {
    return title.trim().replace(/[^A-Za-z0-9 -]+/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);
  }
  function toBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1]);
      r.onerror = () => reject(new Error('Could not read that file.'));
      r.readAsDataURL(file);
    });
  }

  // ---------- minutes list ----------
  async function loadMinutes() {
    const box = $('minutes-list');
    let list;
    try {
      const res = await fetch('../minutes.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error();
      list = await res.json();
    } catch (e) {
      box.replaceChildren(el('p', { className: 'empty', textContent: 'No minutes have been published yet.' }));
      return;
    }
    if (!list.length) {
      box.replaceChildren(el('p', { className: 'empty', textContent: 'No minutes have been published yet.' }));
      return;
    }
    const byYear = {};
    list.forEach((m) => { (byYear[m.date.slice(0, 4)] = byYear[m.date.slice(0, 4)] || []).push(m); });
    const frag = document.createDocumentFragment();
    Object.keys(byYear).sort().reverse().forEach((year) => {
      const ul = el('ul', { className: 'minutes' });
      byYear[year].forEach((m) => {
        const li = el('li', {}, [
          el('span', { className: 'm-date', textContent: fmtDate(m.date) }),
          el('a', { className: 'm-title', href: '../minutes/' + encodeURIComponent(m.file), target: '_blank', rel: 'noopener', textContent: m.title }),
        ]);
        if (signedIn) {
          const del = el('button', { type: 'button', className: 'btn danger', textContent: 'Delete' });
          del.setAttribute('aria-label', 'Delete ' + m.title);
          del.addEventListener('click', () => removeMinute(m));
          li.append(del);
        }
        ul.append(li);
      });
      frag.append(el('div', { className: 'year' }, [el('h3', { textContent: year }), ul]));
    });
    box.replaceChildren(frag);
  }

  async function removeMinute(m) {
    if (!confirm('Delete “' + m.title + '”? It will disappear from the website within a couple of minutes.')) return;
    try {
      const path = 'minutes/' + encodeURIComponent(m.file);
      const info = await gh(repoPath() + '/contents/' + path + '?ref=' + encodeURIComponent(CFG.branch));
      await gh(repoPath() + '/contents/' + path, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Remove minutes: ' + m.file, sha: info.sha, branch: CFG.branch }),
      });
      alert('Deleted. The list will update once the site has republished (a minute or two).');
    } catch (e) {
      alert(e.message);
    }
  }

  // ---------- session ----------
  function setSignedIn(name) {
    signedIn = Boolean(name);
    $('admin').classList.toggle('hidden', !signedIn);
    $('open-login').parentElement.classList.toggle('hidden', signedIn);
    if (signedIn) $('who').textContent = name;
    if (!signedIn) token = null;
  }

  const dialog = $('login-dialog');
  $('open-login').addEventListener('click', () => {
    $('login-msg').textContent = configured ? '' : 'This website has not been connected to its GitHub repository yet (see pc/config.js).';
    dialog.showModal();
  });
  $('login-cancel').addEventListener('click', () => dialog.close());

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) return;
    const f = e.target;
    $('login-msg').textContent = '';
    token = f.token.value.trim();
    try {
      const name = await checkAccess();
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch (err) { /* private mode */ }
      f.reset();
      dialog.close();
      setSignedIn(name);
      loadMinutes();
      $('admin').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      token = null;
      $('login-msg').textContent = err.status === 401 ? 'That token was not accepted.' : err.message;
    }
  });

  $('logout').addEventListener('click', () => {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    setSignedIn(null);
    loadMinutes();
  });

  // ---------- upload ----------
  $('upload-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('upload-msg');
    const date = form.date.value;
    const file = form.file.files[0];
    const title = form.title.value.trim();
    msg.className = 'msg';
    if (!file) { msg.className = 'msg err'; msg.textContent = 'Please choose a PDF file.'; return; }
    if (file.size > MAX_BYTES) { msg.className = 'msg err'; msg.textContent = 'That file is too large (20 MB maximum).'; return; }
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { msg.className = 'msg err'; msg.textContent = 'Only PDF files can be uploaded.'; return; }

    const name = date + (slug(title) ? '_' + slug(title) : '') + '.pdf';
    msg.textContent = 'Uploading…';
    try {
      const content = await toBase64(file);
      await gh(repoPath() + '/contents/minutes/' + encodeURIComponent(name), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Add minutes: ' + name, content, branch: CFG.branch }),
      });
      form.reset();
      msg.className = 'msg ok';
      msg.textContent = 'Uploaded. It will appear in the list below in a minute or two, once the site has republished.';
    } catch (err) {
      msg.className = 'msg err';
      msg.textContent = err.status === 422
        ? 'Minutes with that date and title have already been uploaded. Change the title, or delete the old one first.'
        : err.status === 401 || err.status === 403
          ? 'Your sign-in has expired or lacks permission. Please sign out and sign in again.'
          : err.message;
    }
  });

  // restore a sign-in within the same browser tab
  (async function init() {
    if (configured) {
      try { token = sessionStorage.getItem(TOKEN_KEY); } catch (e) { token = null; }
      if (token) {
        try { setSignedIn(await checkAccess()); } catch (e) { setSignedIn(null); try { sessionStorage.removeItem(TOKEN_KEY); } catch (x) { /* ignore */ } }
      }
    }
    loadMinutes();
  })();
})();
