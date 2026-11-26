// Token Radar's plain dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the protocol's farm plan. No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  // The arithmetic is not repeated here: model.js is loaded by index.html before this file and the
  // board was written by the same functions, so a row's detail is recomputed with the model's own code.
  var M = window.RadarModel;
  var CTX = DATA.comparables;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  // One row's model values, from the model file: the page recomputes the row from the snapshot figures
  // and checks the number board.json carries, so the page and the board cannot show different maths.
  function impliedOf(row) {
    return M.value(row, CTX);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is model.js's farm(), the same call main.ts makes to write board.json: the category
  // picks the action, the TVL sizes the capital, the age sets the hold, and the row's own modelled
  // value against its launch odds produces the net-dollars-an-hour line. No protocol name is special.
  function farmSteps(p) {
    return M.farm(p, M.value(p, CTX)).map(M.stepText);
  }

  // The row's risk-adjusted value: the point value times the odds its category launches a token at.
  function expectancy(row) {
    return Math.round(row.implied_value_usd * (row.launch_odds === undefined || row.launch_odds === null ? 0.05 : row.launch_odds));
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var top = DATA.rows.reduce(function (a, r) { return r.implied_value_usd > a.implied_value_usd ? r : a; }, DATA.rows[0]);
    return el('section', { class: 'lede' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Pre-token radar / ' + DATA.rows.length + ' ranked' }),
        el('h1', { text: DATA.board_size + ' pre-token protocols, ranked by implied value' }),
        el('p', { text: 'The board is every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record (' + DATA.watchlist_size + ' watchlist names), plus the ' + DATA.early_size + ' largest pre-token protocols below that floor. Each value is its TVL priced at the multiple its own category already trades at, with the peers\' interquartile spread as its range. It is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact hot' }, el('span', { text: 'Top implied' }), el('b', { text: fmtUsd(top ? top.implied_value_usd : 0) })),
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Below floor' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live comparables' }), el('b', { text: String(DATA.live_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Snapshot' }), el('b', { text: String(DATA.as_of).slice(0, 10) }))
      )
    );
  }

  // The category chips are the board's shortest path: one click narrows 200 rows to one sector and
  // the count on the chip is the sector's share of the ranked board, not a separate number.
  function categoryCounts() {
    var counts = {};
    DATA.rows.forEach(function (r) { var c = r.category || 'Other'; counts[c] = (counts[c] || 0) + 1; });
    return Object.keys(counts).map(function (c) { return { category: c, count: counts[c] }; })
      .sort(function (a, b) { return b.count - a.count || (a.category < b.category ? -1 : 1); });
  }
  function chips() {
    var all = el('button', { class: 'chip', type: 'button', 'aria-pressed': state.category === 'all' ? 'true' : 'false', onclick: function () { state.category = 'all'; writeHash(); render(); } },
      el('span', { text: 'All sectors' }), el('b', { text: String(DATA.rows.length) }));
    var rest = categoryCounts().slice(0, 7).map(function (c) {
      return el('button', { class: 'chip', type: 'button', 'aria-pressed': state.category === c.category ? 'true' : 'false', onclick: function () { state.category = state.category === c.category ? 'all' : c.category; writeHash(); render(); } },
        el('span', { text: c.category }), el('b', { text: String(c.count) }));
    });
    return el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by sector' }, [all].concat(rest));
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub field-label', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') }),
          el('div', { class: 'tags' }, (r.chains || []).slice(0, 3).map(function (c) { return el('span', { class: 'tag', text: c }); }))
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num sub', text: fmtUsd(r.implied_low_usd) + ' \u2013 ' + fmtUsd(r.implied_high_usd) }),
        el('td', { class: 'num signal', text: Math.round((r.launch_odds || 0) * 100) + '% \u00b7 ' + fmtUsd(expectancy(r)) }),
        el('td', { class: 'num', text: (r.multiple_of_tvl ? r.multiple_of_tvl.toFixed(2) + '\u00d7' : 'n/a') }),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. The bar is implied value relative to the top row. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Range (25-75%)' }),
            el('th', { scope: 'col', text: 'Odds / EV' }),
            el('th', { scope: 'col', text: '\u00d7 TVL' }),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num signal', text: (r.multiple_of_tvl ? r.multiple_of_tvl.toFixed(2) + '\u00d7' : 'n/a') }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Mc / TVL' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var g = DATA.comparables.global;
    var catRows = DATA.comparables.cats.slice(0, 12);
    var widest = DATA.comparables.cats.reduce(function (a, c) { return Math.max(a, c.live); }, 0);
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'The snapshot already answers what a protocol with a token is worth: divide its market cap by its TVL. Among the ' + g.n + ' live-token protocols here that ratio has a median of ' + g.median.toFixed(2) + 'x, a 25th percentile of ' + g.q25.toFixed(2) + 'x and a 75th of ' + g.q75.toFixed(2) + 'x. A pre-token protocol is valued by pricing its own TVL at its category median ratio, so the number comes from the market rather than from a house constant.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('p', { class: 'sub', text: 'The category multiple is the trimmed median of market cap / TVL among that category live tokens, over peer sets of 1 to ' + widest + ' tokens. A category with fewer than ' + m.shrink_peers + ' peers is shrunk toward the whole market median, so one launch cannot set a sector. The range beside each row widens that value by the peers interquartile spread, clamped to a factor of ' + (Math.round(Math.exp(0.3) * 10) / 10) + 'x at the narrowest and ' + (Math.round(Math.exp(2) * 10) / 10) + 'x at the widest; the low is never above the value and the high never below it. Age is the time since the index first listed the protocol; an unlisted age uses ' + m.unknown_age_days + ' days. Launch odds are the category base rate of protocols that already have a token, smoothed by the whole market rate and discounted 8% a year without one. Risk-adjusted value is the value times those odds, which is the number a farm is actually betting on.' }),
      el('p', { class: 'eyebrow', text: 'Comparable set, by category' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Market cap divided by TVL among the protocols whose token already trades, by category. Peers is the sample the median is taken over; Live / Total is how many of the category protocols have a token at all.' }),
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }),
            el('th', { scope: 'col', text: 'Peers' }),
            el('th', { scope: 'col', text: 'Live / Total' }),
            el('th', { scope: 'col', text: 'Median x TVL' }),
            el('th', { scope: 'col', text: '25th' }),
            el('th', { scope: 'col', text: '75th' })
          )),
          el('tbody', null, catRows.map(function (c) {
            return el('tr', null,
              el('td', { text: c.category }),
              el('td', { class: 'num', text: String(c.peers) }),
              el('td', { class: 'num', text: c.live + ' / ' + c.total }),
              el('td', { class: 'num', text: (c.multiple === null || c.multiple === undefined) ? 'n/a' : c.multiple.toFixed(2) + 'x' }),
              el('td', { class: 'num sub', text: (c.q25 === null || c.q25 === undefined) ? 'n/a' : c.q25.toFixed(2) + 'x' }),
              el('td', { class: 'num sub', text: (c.q75 === null || c.q75 === undefined) ? 'n/a' : c.q75.toFixed(2) + 'x' })
            );
          }))
        )
      )
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Category multiple of TVL' }), el('b', { class: 'num', text: (row.multiple_of_tvl ? row.multiple_of_tvl.toFixed(3) + '\u00d7' : 'n/a') + ' from ' + row.peer_tokens + ' token' + (row.peer_tokens === 1 ? '' : 's') })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'Model range (25-75%)' }), el('b', { class: 'num', text: fmtUsd(row.implied_low_usd) + ' to ' + fmtUsd(row.implied_high_usd) })),
        el('div', null, el('span', { text: 'Launch odds' }), el('b', { class: 'num', text: Math.round((row.launch_odds || 0) * 100) + '%' })),
        el('div', null, el('span', { text: 'Risk-adjusted value' }), el('b', { class: 'num signal', text: fmtUsd(expectancy(row)) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the page recomputes this row with the same function that wrote board.json as ' + fmtUsd(impliedOf(row).implied) + (impliedOf(row).implied === row.implied_value_usd ? ', the same number the board carries.' : ', which differs from the board: the data would be stale.') + " The value is TVL priced at the multiple this protocol's category already trades at, adjusted for its own seven-day growth and for how long it has gone without a token. It is an estimate, not a price." })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    if (state.tab === 'pre-token') shell.appendChild(chips());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();