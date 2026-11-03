(function () {
  'use strict';

  var LARGE = [25, 50, 75, 100];
  var SMALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  var SYM = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  var ROUND_SECONDS = 30;
  var STORE_KEY = 'numbers-round-tally';
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function $(id) { return document.getElementById(id); }
  var segEl = $('seg'), segLabel = $('seg-label'), dealBtn = $('deal'), setupEl = $('setup');
  var tilesBox = $('tiles'), opsBox = $('ops'), logEl = $('log'), msgEl = $('msg');
  var closestEl = $('closest'), targetEl = $('target'), ledEl = $('led');
  var arc = $('arc'), secsEl = $('secs'), clockEl = $('clock');
  var undoBtn = $('undo'), resetBtn = $('reset'), mainBtn = $('main');
  var resultEl = $('result'), tallyEl = $('tally'), clearBtn = $('clear'), newBtn = $('newgame');
  var opEls = Array.prototype.slice.call(opsBox.querySelectorAll('.op'));

  var CIRC = 2 * Math.PI * 44;
  arc.style.strokeDasharray = String(CIRC);

  // ---------- state ----------
  // init | choose | dealing | ready | playing | timeup | over
  // timeup: the clock has stopped but the player can still enter their working, then submit.
  var phase = 'init';
  var bigCount = 0;
  var tiles = [null, null, null, null, null, null];
  var startNums = [];
  var target = 0;
  var sel = null, op = null;
  var steps = [];
  var undoStack = [];
  var endAt = 0, timerId = null;
  var buzzer = null;
  var errorMsg = '';
  var tally = loadTally();
  var newArmed = false, newTimer = null;   // New game asks for a second tap when there is something to lose

  function active() { return phase === 'playing' || phase === 'timeup'; }

  // ---------- helpers ----------
  function shuffle(a) {
    var r = a.slice();
    for (var i = r.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = r[i]; r[i] = r[j]; r[j] = t;
    }
    return r;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function loadTally() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o.rounds === 'number' && typeof o.points === 'number') return o;
      }
    } catch (e) {}
    return { rounds: 0, points: 0 };
  }
  function saveTally() { try { localStorage.setItem(STORE_KEY, JSON.stringify(tally)); } catch (e) {} }

  // ---------- SOLVER START ----------
  function solve(nums, goal) {
    var best = { diff: Infinity, depth: 99, val: null, path: [] };
    var seen = new Set();
    var cur = [];
    function consider(v, depth) {
      var d = Math.abs(v - goal);
      if (d < best.diff || (d === best.diff && depth < best.depth)) {
        best = { diff: d, depth: depth, val: v, path: cur.slice() };
      }
    }
    function step(a, b, o, v, rest) {
      cur.push({ a: a, b: b, o: o, r: v });
      consider(v, cur.length);
      rest.push(v);
      rec(rest);
      rest.pop();
      cur.pop();
    }
    function rec(list) {
      var n = list.length;
      if (n < 2) return;
      if (best.diff === 0 && cur.length + 1 >= best.depth) return;
      var key = list.slice().sort(function (x, y) { return x - y; }).join(',');
      if (seen.has(key)) return;
      seen.add(key);
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var a = list[i], b = list[j];
          if (a < b) { var t = a; a = b; b = t; }
          var rest = [];
          for (var k = 0; k < n; k++) if (k !== i && k !== j) rest.push(list[k]);
          step(a, b, '+', a + b, rest);
          if (b > 1) step(a, b, '*', a * b, rest);
          if (a > b) step(a, b, '-', a - b, rest);
          if (b > 1 && a % b === 0) step(a, b, '/', a / b, rest);
        }
      }
    }
    for (var i = 0; i < nums.length; i++) consider(nums[i], 0);
    rec(nums.slice());
    return best;
  }
  // ---------- SOLVER END ----------

  // ---------- rendering ----------
  function renderTiles() {
    for (var i = 0; i < 6; i++) {
      var t = tiles[i], b = tilesBox.children[i];
      if (!t) {
        b.className = 'tile empty';
        b.textContent = '';
        b.disabled = true;
        b.setAttribute('aria-label', 'Empty slot ' + (i + 1));
        continue;
      }
      var len = Math.min(String(t.v).length, 8);
      b.className = 'tile' + (t.big ? ' big' : '') + (t.res ? ' res' : '') + ' d' + len +
        (sel === i ? ' sel' : '') + (t.anim ? ' anim-' + t.anim : '');
      b.textContent = String(t.v);
      b.disabled = !active();
      b.setAttribute('aria-label', t.v + (t.res ? ', result' : t.big ? ', large number' : '') + (sel === i ? ', selected' : ''));
      b.setAttribute('aria-pressed', sel === i ? 'true' : 'false');
    }
  }
  function renderWork() {
    logEl.innerHTML = '';
    if (!steps.length) {
      var li = document.createElement('li');
      li.className = 'empty';
      li.textContent = active()
        ? 'Pick a tile, an operator, then a second tile.'
        : 'Your calculations will appear here.';
      logEl.appendChild(li);
    } else {
      steps.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s.a + ' ' + SYM[s.o] + ' ' + s.b + ' = ' + s.r;
        logEl.appendChild(li);
      });
    }
    var c = closestTile();
    if (c === null) closestEl.textContent = 'Closest: none';
    else closestEl.textContent = c.diff === 0 ? 'Exact: ' + c.v : 'Closest: ' + c.v + ', ' + c.diff + ' away';
  }
  function closestTile() {
    if (!target) return null;
    var best = null;
    tiles.forEach(function (t) {
      if (!t) return;
      var d = Math.abs(t.v - target);
      if (best === null || d < best.diff) best = { v: t.v, diff: d };
    });
    return best;
  }
  function renderMsg() {
    if (errorMsg) { msgEl.textContent = errorMsg; msgEl.className = 'msg err'; return; }
    msgEl.className = 'msg';
    var t = '';
    if (phase === 'choose' || phase === 'init') t = 'Choose how many large numbers, then deal.';
    else if (phase === 'ready') t = 'Check the numbers, then start the clock.';
    else if (phase === 'dealing') t = 'Dealing.';
    else if (phase === 'playing') t = sel === null ? 'Pick a number.' : op === null ? 'Now pick an operator.' : 'Now pick the second number.';
    else if (phase === 'timeup') {
      msgEl.className = 'msg note';
      t = 'The clock has stopped. Enter your working, then press Submit.';
    }
    msgEl.textContent = t;
  }
  function renderControls() {
    var live = active();
    document.body.setAttribute('data-phase', phase);
    setupEl.hidden = !(phase === 'init' || phase === 'ready' || phase === 'dealing' || phase === 'choose');
    segLabel.textContent = phase === 'choose' ? 'Large numbers for this round' : 'Large numbers';
    dealBtn.textContent = phase === 'choose' ? 'Deal numbers' : 'Deal new numbers';
    dealBtn.disabled = phase === 'dealing';
    Array.prototype.forEach.call(segEl.children, function (b) {
      b.setAttribute('aria-pressed', String(+b.getAttribute('data-n') === bigCount));
      b.disabled = phase === 'dealing';
    });
    opEls.forEach(function (b) {
      var on = live && op === b.getAttribute('data-op');
      b.disabled = !live;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    });
    undoBtn.disabled = !live || !undoStack.length;
    resetBtn.disabled = !live || !undoStack.length;
    mainBtn.hidden = phase === 'over' || phase === 'choose' || phase === 'init';
    mainBtn.disabled = phase === 'dealing';
    newBtn.disabled = phase === 'dealing';
    newBtn.textContent = newArmed ? 'Tap again to restart' : 'New game';
    mainBtn.textContent = phase === 'playing' ? 'Declare' : phase === 'timeup' ? 'Submit' : 'Start the clock';
  }
  function renderTally() {
    tallyEl.textContent = tally.rounds
      ? tally.rounds + (tally.rounds === 1 ? ' round' : ' rounds') + ' played, ' + tally.points + (tally.points === 1 ? ' point' : ' points')
      : 'No rounds played yet';
    clearBtn.hidden = !tally.rounds;
  }
  function renderAll() { renderTiles(); renderWork(); renderMsg(); renderControls(); }
  function setTarget(text) {
    targetEl.textContent = text;
    ledEl.setAttribute('aria-label', /^\d+$/.test(text) && target ? 'Target ' + target : 'Target not set');
  }
  function updateClock(rem) {
    var frac = Math.max(0, Math.min(1, rem / ROUND_SECONDS));
    arc.style.strokeDashoffset = String(CIRC * (1 - frac));
    secsEl.textContent = String(Math.ceil(rem));
    clockEl.classList.toggle('low', active() && rem <= 5);
  }

  // ---------- dealing ----------
  function buildSeg() {
    for (var n = 0; n <= 4; n++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('data-n', String(n));
      b.setAttribute('aria-label', n + (n === 1 ? ' large number' : ' large numbers'));
      b.textContent = String(n);
      b.addEventListener('click', function () {
        if (phase === 'dealing') return;
        bigCount = +this.getAttribute('data-n');
        renderControls();
      });
      segEl.appendChild(b);
    }
  }
  function buildTiles() {
    for (var i = 0; i < 6; i++) {
      (function (idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'tile empty';
        b.disabled = true;
        b.setAttribute('aria-keyshortcuts', String(idx + 1));
        b.addEventListener('click', function () { onTile(idx); });
        b.addEventListener('animationend', function () {
          var t = tiles[idx];
          if (t && t.anim) { t.anim = null; b.classList.remove('anim-deal', 'anim-pop'); }
        });
        tilesBox.appendChild(b);
      })(i);
    }
  }
  function resetRound() {
    clearInterval(timerId);
    tiles = [null, null, null, null, null, null];
    startNums = [];
    target = 0;
    buzzer = null;
    sel = null; op = null; steps = []; undoStack = []; errorMsg = '';
    resultEl.hidden = true;
    resultEl.innerHTML = '';
    setTarget('---');
    updateClock(ROUND_SECONDS);
  }
  function toChoose() {
    if (phase !== 'over') return;
    phase = 'choose';
    resetRound();
    renderAll();
  }
  async function rollTarget(final) {
    var s = String(final);
    if (reduceMotion) { setTarget(s); return; }
    function rnd() { return String(Math.floor(Math.random() * 10)); }
    var t0 = Date.now();
    while (Date.now() - t0 < 700) {
      setTarget(rnd() + rnd() + rnd());
      await sleep(55);
    }
    for (var k = 1; k <= 3; k++) {
      for (var f = 0; f < 5; f++) {
        var out = s.slice(0, k);
        for (var m = k; m < 3; m++) out += rnd();
        setTarget(out);
        await sleep(55);
      }
    }
    setTarget(s);
  }
  async function deal(instant) {
    if (phase === 'dealing' || active()) return;
    phase = 'dealing';
    resetRound();
    renderAll();
    var large = shuffle(LARGE).slice(0, bigCount);
    var small = shuffle(SMALL).slice(0, 6 - bigCount);
    var nums = large.map(function (v) { return { v: v, big: true }; })
      .concat(small.map(function (v) { return { v: v, big: false }; }));
    for (var i = 0; i < 6; i++) {
      tiles[i] = { v: nums[i].v, big: nums[i].big, res: false, anim: instant || reduceMotion ? null : 'deal' };
      renderTiles();
      if (!instant && !reduceMotion) await sleep(360);
    }
    startNums = nums.map(function (n) { return n.v; });
    target = 101 + Math.floor(Math.random() * 899);
    if (instant) setTarget(String(target)); else await rollTarget(target);
    setTarget(String(target));
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
    if (rem <= 0 && phase === 'playing') clockStopped();
  }
  function clockStopped() {
    clearInterval(timerId);
    buzzer = closestTile();
    phase = 'timeup';
    errorMsg = '';
    updateClock(0);
    renderAll();
  }
  function onTile(i) {
    if (!active() || !tiles[i]) return;
    errorMsg = '';
    if (sel === null) sel = i;
    else if (sel === i) { sel = null; op = null; }
    else if (op) { combine(sel, i, op); return; }
    else sel = i;
    renderAll();
  }
  function setOp(o) {
    if (!active()) return;
    errorMsg = '';
    if (sel === null) errorMsg = 'Pick a number first.';
    else op = op === o ? null : o;
    renderAll();
  }
  function combine(i, j, o) {
    var a = tiles[i].v, b = tiles[j].v, r;
    if (o === '+') r = a + b;
    else if (o === '*') r = a * b;
    else if (o === '-') {
      if (a <= b) { errorMsg = SYM['-'] + ' needs the first number to be larger. Pick another tile or operator.'; renderAll(); return; }
      r = a - b;
    } else {
      if (b === 0 || a % b !== 0) { errorMsg = a + ' ÷ ' + b + ' is not a whole number. Pick another tile or operator.'; renderAll(); return; }
      r = a / b;
    }
    undoStack.push({
      tiles: tiles.map(function (t) { return t && { v: t.v, big: t.big, res: t.res, anim: null }; }),
      steps: steps.slice()
    });
    steps.push({ a: a, b: b, o: o, r: r });
    tiles[i] = { v: r, big: false, res: true, anim: 'pop' };
    tiles[j] = null;
    sel = null; op = null; errorMsg = '';
    renderAll();
    if (r === target) setTimeout(function () { finish('exact'); }, 250);
  }
  function restore(snap) {
    tiles = snap.tiles.map(function (t) { return t && { v: t.v, big: t.big, res: t.res, anim: null }; });
    steps = snap.steps.slice();
    sel = null; op = null; errorMsg = '';
    renderAll();
  }
  function undo() {
    if (!active() || !undoStack.length) return;
    restore(undoStack.pop());
  }
  function startOver() {
    if (!active() || !undoStack.length) return;
    var first = undoStack[0];
    undoStack = [];
    restore(first);
  }

  // ---------- new game ----------
  // Restart from scratch: stop the clock, wipe the round, the tally and the large-number choice (back to 0).
  // The board is left empty with the target at ---, and the player deals when ready.
  function disarmNew() { newArmed = false; clearTimeout(newTimer); }
  function newGame() {
    if (phase === 'dealing') return;
    var atStake = tally.rounds > 0 || active() || phase === 'over';
    if (atStake && !newArmed) {
      newArmed = true;
      renderControls();
      newTimer = setTimeout(function () { disarmNew(); renderControls(); }, 4000);
      return;
    }
    disarmNew();
    clearInterval(timerId);
    tally = { rounds: 0, points: 0 };
    saveTally();
    bigCount = 0;
    phase = 'init';
    resetRound();
    renderAll();
    renderTally();
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  // ---------- finishing ----------
  function finish(reason) {
    if (!active()) return;
    clearInterval(timerId);
    phase = 'over';
    sel = null; op = null; errorMsg = '';
    var c = closestTile();
    var pts = c.diff === 0 ? 10 : c.diff <= 5 ? 7 : c.diff <= 10 ? 5 : 0;
    tally.rounds += 1;
    tally.points += pts;
    saveTally();
    renderAll();
    renderTally();
    showResult(c, pts);
  }
  function showResult(c, pts) {
    var verdict, tone;
    if (c.diff === 0) { verdict = 'Exact. ' + pts + ' points.'; tone = 'good'; }
    else if (pts > 0) { verdict = c.v + ' is ' + c.diff + ' away. ' + pts + ' points.'; tone = 'ok'; }
    else { verdict = c.v + ' is ' + c.diff + ' away. No points.'; tone = 'none'; }
    var note = '';
    if (buzzer && buzzer.v !== c.v) {
      note = '<p class="note">When the clock stopped, your closest was ' + buzzer.v + ' (' + buzzer.diff +
        ' away). After the clock you finished on ' + c.v + '.</p>';
    }
    resultEl.innerHTML =
      '<h2 class="verdict ' + tone + '">' + verdict + '</h2>' + note +
      '<dl class="stats">' +
        '<div><dt>Your number</dt><dd>' + c.v + '</dd></div>' +
        '<div><dt>Target</dt><dd>' + target + '</dd></div>' +
        '<div><dt>Points</dt><dd>' + pts + '</dd></div>' +
      '</dl>' +
      '<div class="solver"><p class="label">Best possible</p>' +
        '<p id="solverLine">Searching every combination.</p>' +
        '<ol class="steps" id="solverSteps"></ol></div>' +
      '<button class="btn primary again" type="button" id="again">Next round</button>';
    resultEl.hidden = false;
    $('again').addEventListener('click', function () {
      toChoose();
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    try { resultEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) {}
    var nums = startNums.slice(), goal = target, mine = c.diff;
    setTimeout(function () {
      var sol = solve(nums, goal);
      if (resultEl.hidden || goal !== target) return;
      var line = $('solverLine'), list = $('solverSteps');
      if (!line || !list) return;
      var n = sol.path.length;
      if (sol.diff === 0) {
        line.textContent = (mine === 0 ? 'You matched the shortest route. ' : '') + 'The target can be hit exactly in ' + n + (n === 1 ? ' step.' : ' steps.');
      } else if (n === 0) {
        line.textContent = 'No exact answer exists. The closest is the tile ' + sol.val + ' itself, ' + sol.diff + ' away.';
      } else {
        line.textContent = 'No exact answer exists. The closest reachable number is ' + sol.val + ', ' + sol.diff + ' away' +
          (mine === sol.diff ? ', and you found it.' : '.');
      }
      sol.path.forEach(function (s) {
        var li = document.createElement('li');
        li.textContent = s.a + ' ' + SYM[s.o] + ' ' + s.b + ' = ' + s.r;
        list.appendChild(li);
      });
    }, 60);
  }

  // ---------- wiring ----------
  buildSeg();
  buildTiles();
  opEls.forEach(function (b) { b.addEventListener('click', function () { setOp(b.getAttribute('data-op')); }); });
  undoBtn.addEventListener('click', undo);
  resetBtn.addEventListener('click', startOver);
  mainBtn.addEventListener('click', function () {
    if (phase === 'ready') startClock();
    else if (active()) finish('declared');
  });
  dealBtn.addEventListener('click', function () { deal(false); });
  newBtn.addEventListener('click', newGame);
  clearBtn.addEventListener('click', function () { tally = { rounds: 0, points: 0 }; saveTally(); renderTally(); });

  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    var onButton = e.target && e.target.closest && e.target.closest('button, summary');
    if (k === 'Enter' && !onButton) {
      if (phase === 'ready') { e.preventDefault(); startClock(); }
      else if (active()) { e.preventDefault(); finish('declared'); }
      return;
    }
    if (!active()) return;
    if (k.length === 1 && k >= '1' && k <= '6') { e.preventDefault(); onTile(+k - 1); }
    else if (k === '+' || k === '-' || k === '*' || k === '/') { e.preventDefault(); setOp(k); }
    else if (k === 'x' || k === 'X') { setOp('*'); }
    else if (k === 'Backspace') { e.preventDefault(); undo(); }
    else if (k === 'Escape') { sel = null; op = null; errorMsg = ''; renderAll(); }
  });

  // The page opens with an empty board and the target at ---; nothing is dealt until Deal new numbers is pressed.
  renderAll();
  renderTally();

  if (window.navigator.standalone === true) document.documentElement.classList.add('app');

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('countdown-sw.js').catch(function () {});
    });
  }
})();
