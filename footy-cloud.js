/* Pitch Plan cloud sign-in and sync (Firebase).
   Loaded by footy.html as a module. If footy-firebase-config.js has not been filled in,
   this file does nothing and Pitch Plan keeps saving on the device only. */
const cfg = window.FOOTY_FIREBASE;
const cloud = window.__footyCloud;
const api = window.__footy;
const OWNER_KEY = 'footy_cloud_owner';

function set(patch) { Object.assign(cloud, patch); if (api && api.render) api.render(); }
const configured = cfg && cfg.apiKey && cfg.projectId && !/PASTE|YOUR/i.test(cfg.apiKey + cfg.projectId);

if (!configured || !api || !cloud) {
  if (cloud) cloud.state = 'off';
} else {
  start();
}

async function start() {
  set({ state: 'loading' });
  const base = cfg.sdkBase || 'https://www.gstatic.com/firebasejs/10.14.1';
  let A, Au, Fs;
  try {
    [A, Au, Fs] = await Promise.all([
      import(base + '/firebase-app.js'),
      import(base + '/firebase-auth.js'),
      import(base + '/firebase-firestore.js')
    ]);
  } catch (e) {
    set({ state: 'error', msg: 'Could not reach the sign-in service. You can still use Pitch Plan. Your plan is saved on this device.' });
    return;
  }
  const app = A.initializeApp(cfg);
  const auth = Au.getAuth(app);
  const db = Fs.getFirestore(app);
  let ref = null, unsub = null, timer = null, lastPushed = 0, pushing = false;

  const NICE = {
    'auth/invalid-credential': 'That email and password do not match.',
    'auth/wrong-password': 'That email and password do not match.',
    'auth/user-not-found': 'That email and password do not match.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/email-already-in-use': 'There is already an account with that email. Try signing in.',
    'auth/weak-password': 'Choose a longer password, at least 8 characters.',
    'auth/too-many-requests': 'Too many tries. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups and try again.',
    'auth/unauthorized-domain': 'This website address is not allowed yet. Add it under Authorised domains in Firebase.',
    'auth/operation-not-allowed': 'This sign-in method is not switched on in Firebase yet.',
    'auth/requires-recent-login': 'For safety, sign out, sign in again, then delete your account.'
  };
  const nice = e => NICE[e && e.code] || 'Something went wrong. Please try again.';

  function backupLocal() {
    try {
      const k = 'pitchplan_backup_' + Date.now();
      localStorage.setItem(k, JSON.stringify(api.get()));
      const all = Object.keys(localStorage).filter(x => x.indexOf('pitchplan_backup_') === 0).sort();
      while (all.length > 3) localStorage.removeItem(all.shift());
    } catch (e) {}
  }
  function parse(d) { try { return JSON.parse(d.data); } catch (e) { return null; } }

  async function push() {
    if (!ref || cloud.conflict || pushing) return;
    if (!navigator.onLine) { set({ msg: 'Offline. Your changes will sync when you are back online.' }); return; }
    pushing = true;
    try {
      const st = api.get(), t = st._t || Date.now();
      await Fs.setDoc(ref, { data: JSON.stringify(st), updated: t });
      lastPushed = t;
      set({ last: Date.now(), msg: '' });
    } catch (e) {
      set({ msg: 'Could not sync just now. It will try again.' });
    }
    pushing = false;
  }
  function schedulePush() { clearTimeout(timer); timer = setTimeout(push, 1500); }

  async function resolveStart(user) {
    ref = Fs.doc(db, 'users', user.uid);
    const owner = localStorage.getItem(OWNER_KEY);
    let snap;
    try { snap = await Fs.getDoc(ref); }
    catch (e) { set({ msg: 'Could not read your account copy. Check your connection.' }); return; }
    const remote = snap.exists() ? parse(snap.data()) : null;
    const rt = snap.exists() ? (snap.data().updated || (remote && remote._t) || 0) : 0;
    const local = api.get(), lt = local._t || 0, localHas = api.hasData();
    const otherOwner = owner && owner !== user.uid;
    if (!remote && !localHas) { localStorage.setItem(OWNER_KEY, user.uid); }
    else if (!remote && localHas && !otherOwner) { localStorage.setItem(OWNER_KEY, user.uid); await push(); }
    else if (remote && !localHas) { localStorage.setItem(OWNER_KEY, user.uid); api.apply(remote, rt); set({ last: Date.now() }); }
    else if (remote && localHas && !otherOwner && JSON.stringify(Object.assign({}, remote, { _t: 0 })) === JSON.stringify(Object.assign({}, local, { _t: 0 }))) { localStorage.setItem(OWNER_KEY, user.uid); set({ last: Date.now() }); }
    else { set({ conflict: { remote: remote, cloudTime: rt, localTime: lt } }); }
    listen();
  }

  function listen() {
    if (unsub) unsub();
    unsub = Fs.onSnapshot(ref, snap => {
      if (!snap.exists() || cloud.conflict) return;
      const d = snap.data(), remote = parse(d), t = d.updated || 0, local = api.get();
      if (remote && t > (local._t || 0) && t !== lastPushed) {
        backupLocal();
        api.apply(remote, t);
        set({ last: Date.now(), msg: '' });
      }
    }, () => {});
  }

  api.onSave = () => { if (cloud.state === 'in' && ref && !cloud.conflict) schedulePush(); };
  window.addEventListener('online', () => { if (cloud.state === 'in') schedulePush(); });

  Au.onAuthStateChanged(auth, user => {
    if (unsub) { unsub(); unsub = null; }
    ref = null; clearTimeout(timer);
    if (user) {
      set({ state: 'in', user: { email: user.email, uid: user.uid }, busy: false, msg: '', conflict: null });
      resolveStart(user);
    } else {
      set({ state: 'out', user: null, busy: false, conflict: null, confirmDelete: false });
    }
  });

  document.addEventListener('input', e => { if (e.target && e.target.id === 'cl-email') cloud.email = e.target.value; });

  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-cloud]');
    if (!b) return;
    const act = b.dataset.cloud;
    const em = (document.getElementById('cl-email') || {}).value || cloud.email || '';
    const pw = (document.getElementById('cl-pass') || {}).value || '';
    cloud.email = em;
    try {
      if (act === 'signin') {
        if (!em || !pw) { set({ msg: 'Type your email and password.' }); return; }
        set({ busy: true, msg: '' });
        await Au.signInWithEmailAndPassword(auth, em.trim(), pw);
      } else if (act === 'signup') {
        const ok = document.getElementById('cl-ok');
        if (!em || pw.length < 8) { set({ msg: 'Type your email and a password with at least 8 characters.' }); return; }
        if (!ok || !ok.checked) { set({ msg: 'Please tick the box to say a parent or carer knows.' }); return; }
        set({ busy: true, msg: '' });
        await Au.createUserWithEmailAndPassword(auth, em.trim(), pw);
      } else if (act === 'google') {
        set({ busy: true, msg: '' });
        await Au.signInWithPopup(auth, new Au.GoogleAuthProvider());
      } else if (act === 'reset') {
        if (!em) { set({ msg: 'Type your email first, then tap Forgot password.' }); return; }
        await Au.sendPasswordResetEmail(auth, em.trim());
        set({ msg: 'If there is an account for that email, we have sent a link to reset the password.' });
      } else if (act === 'signout') {
        await Au.signOut(auth);
      } else if (act === 'sync') {
        set({ msg: 'Syncing…' });
        const snap = await Fs.getDoc(ref), local = api.get();
        if (snap.exists()) {
          const d = snap.data(), remote = parse(d), t = d.updated || 0;
          if (remote && t > (local._t || 0)) { backupLocal(); api.apply(remote, t); set({ last: Date.now(), msg: 'Updated from your account.' }); return; }
        }
        await push();
        if (!cloud.msg) set({ msg: 'Everything is up to date.' });
      } else if (act === 'use-cloud') {
        const k = cloud.conflict; backupLocal();
        if (k && k.remote) api.apply(k.remote, k.cloudTime); else api.reset();
        localStorage.setItem(OWNER_KEY, cloud.user.uid);
        set({ conflict: null, last: Date.now(), msg: 'Done. This device now matches your account.' });
      } else if (act === 'use-device') {
        localStorage.setItem(OWNER_KEY, cloud.user.uid);
        set({ conflict: null });
        api.get()._t = Date.now();
        await push();
        set({ msg: 'Done. Your account now has this device’s copy.' });
      } else if (act === 'delete') {
        if (!cloud.confirmDelete) { set({ confirmDelete: true }); return; }
        const u = auth.currentUser;
        try { await Fs.deleteDoc(ref); } catch (er) {}
        await Au.deleteUser(u);
        localStorage.removeItem(OWNER_KEY);
        set({ confirmDelete: false, msg: 'Your account and the cloud copy are deleted. Your data is still on this device.' });
      } else if (act === 'cancel-delete') {
        set({ confirmDelete: false });
      }
    } catch (er) {
      set({ busy: false, msg: nice(er), confirmDelete: false });
    }
  });
}
