/* Countdown Letters, plus the Numbers / Letters switch.
   Loaded after countdown.js. Uses the same markup classes and styles as the Numbers game. */
(function () {
  'use strict';

  var VOWELS = { A: 15, E: 21, I: 13, O: 13, U: 5 };
  var CONS = { B: 2, C: 3, D: 6, F: 2, G: 3, H: 2, J: 1, K: 1, L: 5, M: 4, N: 8, P: 4, Q: 1, R: 9, S: 9, T: 9, V: 1, W: 1, X: 1, Y: 1, Z: 1 };
  var ROUND_SECONDS = 30;
  var STORE_KEY = 'letters-round-tally';
  var MODE_KEY = 'countdown-mode';
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(id) { return document.getElementById(id); }
  var body = document.body;
  var modeBtns = Array.prototype.slice.call(document.querySelectorAll('#modes button'));
  var vowelBtn = $('lvowel'), consBtn = $('lcons'), randBtn = $('lrand'), setupEl = $('lsetup'), hintEl = $('lhint');
  var tilesBox = $('ltiles'), wordEl = $('lword'), ledEl = $('lled'), ledLabel = $('lledlabel');
  var arc = $('larc'), secsEl = $('lsecs'), clockEl = $('lclock');
  var delBtn = $('ldel'), clrBtn = $('lclr'), mainBtn = $('lmain'), msgEl = $('lmsg');
  var resultEl = $('lresult'), tallyEl = $('ltally'), clearBtn = $('lclear'), newBtn = $('lnewgame');

  var CIRC = 2 * Math.PI * 44;
  arc.style.strokeDasharray = String(CIRC);

  // ---------- state ----------
  // pick | dealing | ready | playing | timeup | over
  var mode = 'numbers';
  var phase = 'pick';
  var piles = null;
  var letters = [];       // the chosen letters, in order
  var fresh = [];         // tiles that should play the deal animation
  var nV = 0, nC = 0;
  var word = [];          // tile indexes, in the order they were tapped
  var endAt = 0, timerId = null;
  var errorMsg = '';
  var tally = loadTally();
  var newArmed = false, newTimer = null;

  function active() { return phase === 'playing' || phase === 'timeup'; }
  function isVowel(l) { return 'AEIOU'.indexOf(l) !== -1; }
  function wordText() { return word.map(function (i) { return letters[i]; }).join(''); }

  // ---------- helpers ----------
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }
  function makePile(counts) {
    var a = [];
    Object.keys(counts).forEach(function (k) { for (var i = 0; i < counts[k]; i++) a.push(k); });
    return shuffle(a);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function loadTally() {
    try {
      var o = JSON.parse(localStorage.getItem(STORE_KEY));
      if (o && typeof o.rounds === 'number' && typeof o.points === 'number') return { rounds: o.rounds, points: o.points, best: o.best || 0 };
    } catch (e) {}
    return { rounds: 0, points: 0, best: 0 };
  }
  function saveTally() { try { localStorage.setItem(STORE_KEY, JSON.stringify(tally)); } catch (e) {} }

  // ---------- word list ----------
  var dictPromise = null, dict = null, wordList = [];
  function ensureDict() {
    if (!dictPromise) {
      dictPromise = fetch('countdown-words.txt')
        .then(function (r) { if (!r.ok) throw new Error('missing'); return r.text(); })
        .then(function (t) {
          wordList = t.split('\n').map(function (w) { return w.trim(); }).filter(Boolean);
          dict = new Set(wordList);
          return true;
        })
        .catch(function () { dictPromise = null; return false; });
    }
    return dictPromise;
  }
  function countLetters(str) {
    var c = {};
    for (var i = 0; i < str.length; i++) c[str[i]] = (c[str[i]] || 0) + 1;
    return c;
  }
  function fits(w, avail) {
    var c = {};
    for (var i = 0; i < w.length; i++) {
      var ch = w[i];
      c[ch] = (c[ch] || 0) + 1;
      if (c[ch] > (avail[ch] || 0)) return false;
    }
    return true;
  }
  function longestWords() {
    var avail = countLetters(letters.join('').toLowerCase());
    var found = wordList.filter(function (w) { return fits(w, avail); });
    found.sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    return found;
  }

  // ---------- rendering ----------
  function renderTiles() {
    for (var i = 0; i < 9; i++) {
      var l = letters[i], b = tilesBox.children[i];
      if (!l) {
        b.className = 'tile empty';
        b.textContent = '';
        b.disabled = true;
        b.setAttribute('aria-label', 'Empty slot ' + (i + 1));
        continue;
      }
      var used = word.indexOf(i) !== -1;
      b.className = 'tile' + (isVowel(l) ? ' big' : '') + (used ? ' used' : '') + (fresh[i] ? ' anim-deal' : '');
      b.textContent = l;
      b.disabled = !active() || used;
      b.setAttribute('aria-label', l + (isVowel(l) ? ', vowel' : ', consonant') + (used ? ', used' : ''));
    }
  }
  function renderWord() {
    var w = wordText();
    wordEl.textContent = w;
    ledLabel.textContent = w.length ? 'Your word \u00b7 ' + w.length + (w.length === 1 ? ' letter' : ' letters') : 'Your word';
    ledEl.setAttribute('aria-label', w ? 'Your word: ' + w + ', ' + w.length + ' letters' : 'Your word: empty');
  }
  function renderMsg() {
    if (errorMsg) { msgEl.textContent = errorMsg; msgEl.className = 'msg err'; return; }
    msgEl.className = 'msg';
    var t = '';
    if (phase === 'pick') t = 'Choose a vowel or a consonant for each tile.';
    else if (phase === 'dealing') t = 'Dealing.';
    else if (phase === 'ready') t = 'Check the letters, then start the clock.';
    else if (phase === 'playing') t = word.length ? 'Keep going, or press Submit.' : 'Tap tiles or type to build your word.';
    else if (phase === 'timeup') { msgEl.className = 'msg note'; t = 'The clock has stopped. Finish your word, then press Submit.'; }
    msgEl.textContent = t;
  }
  function renderControls() {
    body.setAttribute('data-lphase', phase);
    setupEl.hidden = !(phase === 'pick' || phase === 'dealing' || phase === 'ready');
    var picking = phase === 'pick';
    vowelBtn.disabled = !picking || nV >= 5;
    consBtn.disabled = !picking || nC >= 6;
    randBtn.disabled = phase === 'dealing';
    randBtn.textContent = phase === 'ready' ? 'Deal new letters' : 'Deal all nine at random';
    hintEl.textContent = letters.length && picking
      ? letters.length + ' of 9 chosen. At least 3 vowels and 4 consonants.'
      : 'At least 3 vowels and 4 consonants.';
    delBtn.disabled = !active() || !word.length;
    clrBtn.disabled = !active() || !word.length;
    mainBtn.hidden = !(phase === 'ready' || active());
    mainBtn.textContent = phase === 'playing' ? 'Declare' : phase === 'timeup' ? 'Submit' : 'Start the clock';
    newBtn.disabled = phase === 'dealing';
    newBtn.textContent = newArmed ? 'Tap again to restart' : 'New game';
    updateSwitch();
  }
  function renderTally() {
    tallyEl.textContent = tally.rounds
      ? tally.rounds + (tally.rounds === 1 ? ' round' : ' rounds') + ' played, ' + tally.points + (tally.points === 1 ? ' point' : ' points') + ', best ' + tally.best
      : 'No rounds played yet';
    clearBtn.hidden = !tally.rounds;
  }
  function renderAll() { renderTiles(); renderWord(); renderMsg(); renderControls(); }
  function updateClock(rem) {
    var frac = Math.max(0, Math.min(1, rem / ROUND_SECONDS));
    arc.style.strokeDashoffset = String(CIRC * (1 - frac));
    secsEl.textContent = String(Math.ceil(rem));
    clockEl.classList.toggle('low', active() && rem <= 5);
  }

  // ---------- dealing ----------
  function buildTiles() {
    for (var i = 0; i < 9; i++) {
      (function (idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile empty';
        b.disabled = true;
        b.addEventListener('click', function () { addTile(idx); });
        b.addEventListener('animationend', function () {
          if (fresh[idx]) { fresh[idx] = false; b.classList.remove('anim-deal'); }
        });
        tilesBox.appendChild(b);
      })(i);
    }
  }
  function resetRound() {
    clearInterval(timerId);
    piles = { v: makePile(VOWELS), c: makePile(CONS) };
    letters = []; fresh = []; nV = 0; nC = 0; word = []; errorMsg = '';
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    updateClock(ROUND_SECONDS);
  }
  function newRound() {
    phase = 'pick';
    resetRound();
    renderAll();
  }
  function takeLetter(type) {
    var l = piles[type].pop();
    fresh[letters.length] = !reduceMotion;
    letters.push(l);
    if (type === 'v') nV++; else nC++;
  }
  function draw(type) {
    if (phase !== 'pick' || letters.length >= 9) return;
    if (type === 'v' && nV >= 5) return;
    if (type === 'c' && nC >= 6) return;
    takeLetter(type);
    if (letters.length === 9) phase = 'ready';
    renderAll();
  }
  async function dealRandom() {
    if (phase === 'dealing' || active()) return;
    phase = 'dealing';
    resetRound();
    renderAll();
    var r = Math.random();
    var v = r < 0.25 ? 3 : r < 0.7 ? 4 : 5;
    var seq = [];
    for (var i = 0; i < 9; i++) seq.push(i < v ? 'v' : 'c');
    seq = shuffle(seq);
    for (i = 0; i < 9; i++) {
      takeLetter(seq[i]);
      renderTiles();
      if (!reduceMotion) await sleep(260);
    }
    phase = 'ready';
    renderAll();
  }

  // ---------- playing ----------
  function startClock() {
    if (phase !== 'ready') return;
    phase = 'playing';
    endAt = Date.now() + ROUND_SECONDS * 1000;
    errorMsg = '';
    clearInterval(timerId);
    timerId = setInterval(tick, 100);
    tick();
    renderAll();
  }
  function tick() {
    var rem = Math.max(0, (endAt - Date.now()) / 1000);
    updateClock(rem);
    if (rem <= 0 && phase === 'playing') {
      clearInterval(timerId);
      phase = 'timeup';
      errorMsg = '';
      updateClock(0);
      renderAll();
    }
  }
  function addTile(i) {
    if (!active() || !letters[i] || word.indexOf(i) !== -1) return;
    word.push(i);
    errorMsg = '';
    renderAll();
  }
  function addLetter(ch) {
    for (var i = 0; i < letters.length; i++) {
      if (letters[i] === ch && word.indexOf(i) === -1) { addTile(i); return; }
    }
    errorMsg = 'There is no ' + ch + ' left in your letters.';
    renderMsg();
  }
  function removeLast() { if (active() && word.length) { word.pop(); errorMsg = ''; renderAll(); } }
  function clearWord() { if (active() && word.length) { word = []; errorMsg = ''; renderAll(); } }

  // ---------- finishing ----------
  async function finish() {
    if (!active()) return;
    clearInterval(timerId);
    phase = 'over';
    errorMsg = '';
    var shown = wordText();
    var w = shown.toLowerCase();
    renderAll();
    var haveList = await ensureDict();
    var pts = 0, verdict, tone = 'none', note = '';
    if (!w) {
      verdict = 'No word entered.';
    } else if (w.length < 2) {
      verdict = 'A word needs at least two letters.';
    } else if (haveList && !dict.has(w)) {
      verdict = shown + ' is not in the word list.';
      note = 'If it is a real word, it may just be missing from the list.';
    } else {
      pts = w.length === 9 ? 18 : w.length;
      verdict = shown + '. ' + pts + (pts === 1 ? ' point.' : ' points.');
      tone = 'good';
      if (!haveList) note = 'The word list did not load, so this word was not checked.';
    }
    tally.rounds += 1;
    tally.points += pts;
    tally.best = Math.max(tally.best, pts);
    saveTally();
    renderTally();
    showResult(shown, w, pts, verdict, tone, note, haveList);
  }
  function showResult(shown, w, pts, verdict, tone, note, haveList) {
    resultEl.innerHTML =
      '<h2 class="verdict ' + tone + '">' + verdict + '</h2>' +
      (note ? '<p class="note">' + note + '</p>' : '') +
      '<dl class="stats">' +
        '<div><dt>Your word</dt><dd>' + (shown || '\u2013') + '</dd></div>' +
        '<div><dt>Letters</dt><dd>' + w.length + '</dd></div>' +
        '<div><dt>Points</dt><dd>' + pts + '</dd></div>' +
      '</dl>' +
      '<div class="solver"><p class="label">Best possible</p>' +
        '<p id="lsolverLine">' + (haveList ? 'Searching the word list.' : 'The word list did not load, so the best words cannot be shown.') + '</p>' +
        '<ul class="words" id="lsolverWords"></ul></div>' +
      '<button class="btn primary again" type="button" id="lagain">Next round</button>';
    resultEl.hidden = false;
    $('lagain').addEventListener('click', function () {
      newRound();
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    try { resultEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) {}
    if (!haveList) return;
    var mine = w.length;
    setTimeout(function () {
      if (resultEl.hidden) return;
      var line = $('lsolverLine'), list = $('lsolverWords');
      if (!line || !list) return;
      var found = longestWords();
      if (!found.length) { line.textContent = 'No words were found in these letters.'; return; }
      var top = found[0].length;
      line.textContent = (mine === top && pts > 0 ? 'You found a longest word. ' : '') +
        top + '-letter words were possible:';
      found.filter(function (x) { return x.length >= Math.max(top - 1, 2); }).slice(0, 10).forEach(function (x) {
        var li = document.createElement('li');
        li.textContent = x;
        if (x.length === 9) li.className = 'nine';
        list.appendChild(li);
      });
    }, 60);
  }

  // ---------- new game ----------
  function disarmNew() { newArmed = false; clearTimeout(newTimer); }
  function newGame() {
    if (phase === 'dealing') return;
    var atStake = tally.rounds > 0 || letters.length > 0 || active() || phase === 'over';
    if (atStake && !newArmed) {
      newArmed = true;
      renderControls();
      newTimer = setTimeout(function () { disarmNew(); renderControls(); }, 4000);
      return;
    }
    disarmNew();
    tally = { rounds: 0, points: 0, best: 0 };
    saveTally();
    newRound();
    renderTally();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- the Numbers / Letters switch ----------
  var TITLES = {
    numbers: { h: 'Countdown Numbers', t: 'Six tiles, one target, thirty seconds.' },
    letters: { h: 'Countdown Letters', t: 'Nine letters, one word, thirty seconds.' }
  };
  // A game with the clock running (or tiles being dealt) can't be left, or it would carry on unseen
  function busy() {
    if (mode === 'numbers') {
      var p = body.getAttribute('data-phase');
      return p === 'playing' || p === 'dealing';
    }
    return phase === 'playing' || phase === 'dealing';
  }
  function updateSwitch() {
    var b = busy();
    modeBtns.forEach(function (btn) {
      btn.disabled = b;
      btn.title = b ? 'Finish this round first' : '';
      btn.setAttribute('aria-pressed', String(btn.getAttribute('data-mode') === mode));
    });
  }
  function setMode(m) {
    mode = m === 'letters' ? 'letters' : 'numbers';
    body.setAttribute('data-mode', mode);
    $('mode-numbers').hidden = mode !== 'numbers';
    $('mode-letters').hidden = mode !== 'letters';
    $('title').textContent = TITLES[mode].h;
    $('tagline').textContent = TITLES[mode].t;
    document.title = TITLES[mode].h;
    try { localStorage.setItem(MODE_KEY, mode); } catch (e) {}
    try { history.replaceState(null, '', mode === 'letters' ? '#letters' : location.pathname + location.search); } catch (e) {}
    if (mode === 'letters') ensureDict();
    updateSwitch();
  }
  modeBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (busy()) return;
      setMode(btn.getAttribute('data-mode'));
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  });
  // The Numbers game changes data-phase on the body as it goes; follow it so the switch stays in step
  new MutationObserver(updateSwitch).observe(body, { attributes: true, attributeFilter: ['data-phase'] });

  // ---------- wiring ----------
  buildTiles();
  vowelBtn.addEventListener('click', function () { draw('v'); });
  consBtn.addEventListener('click', function () { draw('c'); });
  randBtn.addEventListener('click', dealRandom);
  delBtn.addEventListener('click', removeLast);
  clrBtn.addEventListener('click', clearWord);
  mainBtn.addEventListener('click', function () {
    if (phase === 'ready') startClock();
    else if (active()) finish();
  });
  newBtn.addEventListener('click', newGame);
  clearBtn.addEventListener('click', function () { tally = { rounds: 0, points: 0, best: 0 }; saveTally(); renderTally(); });

  document.addEventListener('keydown', function (e) {
    if (mode !== 'letters') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    var onButton = e.target && e.target.closest && e.target.closest('button, summary');
    if (k === 'Enter' && !onButton) {
      if (phase === 'ready') { e.preventDefault(); startClock(); }
      else if (active()) { e.preventDefault(); finish(); }
      return;
    }
    if (k === 'Backspace') { if (active()) { e.preventDefault(); removeLast(); } return; }
    if (k === 'Escape') { clearWord(); return; }
    if (k.length === 1 && /[a-zA-Z]/.test(k)) {
      var up = k.toUpperCase();
      if (phase === 'pick') {
        if (up === 'V') draw('v'); else if (up === 'C') draw('c');
      } else if (active()) {
        addLetter(up);
      }
    }
  });

  // ---------- start ----------
  piles = { v: makePile(VOWELS), c: makePile(CONS) };
  renderAll();
  renderTally();
  var start = 'numbers';
  try { start = localStorage.getItem(MODE_KEY) || 'numbers'; } catch (e) {}
  if (location.hash === '#letters') start = 'letters';
  else if (location.hash === '#numbers') start = 'numbers';
  setMode(start);
})();
