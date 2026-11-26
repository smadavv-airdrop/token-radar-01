// Token Radar's model: market comparables, a value range and a costed farm plan.
//
// One file, no imports, no network. Node 22 loads it for its side effect (main.ts imports it, then
// reads globalThis.RadarModel), and the page loads it with a plain <script> tag; both call the same
// functions, so the number the board ranks and the number the detail drawer recomputes cannot drift.
//
// Why comparables: the snapshot already carries the market's own answer for 24 live-token protocols,
// their market cap divided by their TVL. That ratio is what a launch is priced at in this market, so
// a pre-token protocol's TVL times the ratio its own category trades at is an evidence-based value
// rather than a fixed house multiple. Categories with few live peers are shrunk toward the whole
// market's ratio, so no category median is decided by one token. The result is a point value plus the
// interquartile range of the peers it came from, which is the honest way to show a model's error.
(function (root) {
  'use strict';

  var C = {
    version: 'comparables-3',
    // growth: a seven-day move is noisy, so it moves the value by at most half its own size.
    growth_floor: -50,
    growth_cap: 120,
    growth_weight: 0.35,
    // maturity: a protocol three years past listing is fully mature; a new one is discounted.
    maturity_floor: 0.55,
    maturity_range: 0.45,
    maturity_days: 1095,
    unknown_age_days: 365,
    // a multiple outside these bounds is a data artefact (a $1 TVL, a wrapped receipt), not a peer.
    multiple_floor: 0.05,
    multiple_cap: 12,
    trim: 0.2, // drop the top and bottom fifth of peers before taking the median
    shrink_peers: 4, // a category needs this many peers before its own median outweighs the market's
    airdrop_share: 0.004, // a single farmed wallet's expected slice of implied value
    max_implied: 1e14, // the gate's ceiling
  };

  function finite(v, fallback) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
  }
  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }
  function round(n) {
    return Math.round(n);
  }
  function round4(n) {
    return Math.round(n * 1e4) / 1e4;
  }

  // Median and interquartile range over logarithms, with the top and bottom `trim` of the sample
  // dropped first: market cap/TVL is multiplicative and heavy-tailed, so one $30B token must not set a
  // category's ratio. All three numbers come from the same kept sample, so the quartiles can never
  // straddle each other or fall on the wrong side of the median.
  function logStats(values, trim) {
    var sample = values.filter(function (v) { return isFinite(v) && v > 0; }).map(Math.log).sort(function (a, b) { return a - b; });
    if (sample.length === 0) return null;
    var cut = Math.floor(sample.length * (trim || 0));
    var kept = sample.length - cut * 2 >= 3 ? sample.slice(cut, sample.length - cut) : sample;
    function at(q) {
      var pos = (kept.length - 1) * q;
      var lo = Math.floor(pos);
      var hi = Math.ceil(pos);
      return Math.exp(kept[lo] + (kept[hi] - kept[lo]) * (pos - lo));
    }
    return { n: sample.length, median: at(0.5), q25: at(0.25), q75: at(0.75) };
  }

  // The protocol's token status, by the snapshot's own fields: no market cap, no CoinGecko id and no
  // symbol means the index records no token. A CEX is never a farm target.
  function isPreToken(p) {
    return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
  }
  function isRankable(p) {
    var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
    return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
  }

  // The market's comparable set, computed once from the snapshot: per category the median and the
  // interquartile range of market cap / TVL among the protocols whose token already trades, plus how
  // many of the category's protocols have a token at all (the base rate the odds start from).
  function comparables(snapshot) {
    var live = [];
    var totals = {};
    var liveByCat = {};
    snapshot.protocols.forEach(function (p) {
      var cat = p.category || 'Other';
      totals[cat] = (totals[cat] || 0) + 1;
      var mcap = finite(p.mcap_usd, 0);
      var tvl = finite(p.tvl_usd, 0);
      if (mcap <= 0 || tvl <= 0 || cat === 'CEX') return;
      liveByCat[cat] = (liveByCat[cat] || 0) + 1;
      live.push({ cat: cat, multiple: mcap / tvl });
    });
    var all = live.map(function (x) { return x.multiple; });
    var g = logStats(all, C.trim) || { n: 0, median: 0.25, q25: 0.1, q75: 1 };
    var global = { n: g.n, median: g.median, q25: g.q25, q75: g.q75 };
    var cats = {};
    Object.keys(liveByCat).forEach(function (cat) {
      var sample = live.filter(function (x) { return x.cat === cat; }).map(function (x) { return x.multiple; });
      var st = logStats(sample, C.trim);
      cats[cat] = {
        live: liveByCat[cat],
        total: totals[cat],
        n: st ? st.n : 0,
        median: st ? st.median : null,
        q25: st ? st.q25 : null,
        q75: st ? st.q75 : null,
      };
    });
    return { global: global, cats: cats, as_of: snapshot.as_of, version: C.version };
  }

  // The multiple a category is valued at: its own peer median, shrunk toward the whole market when it
  // has few peers, so the point value never rests on one token's launch.
  function multipleFor(cat, ctx) {
    var g = ctx.global;
    var c = ctx.cats[cat];
    if (!c || c.median === null) return { median: g.median, q25: g.q25, q75: g.q75, peers: 0, source: 'market' };
    // One live peer is a data point, not a sector median: it gets zero weight and the market's own
    // multiple is used, so a single launch cannot drag a whole category's values with it.
    var w = c.n < 2 ? 0 : (c.n - 1) / (c.n - 1 + C.shrink_peers);
    function blend(a, b) { return Math.exp(w * Math.log(a) + (1 - w) * Math.log(b)); }
    return {
      median: clamp(blend(c.median, g.median), C.multiple_floor, C.multiple_cap),
      q25: clamp(blend(c.q25 || c.median, g.q25), C.multiple_floor, C.multiple_cap),
      q75: clamp(blend(c.q75 || c.median, g.q75), C.multiple_floor, C.multiple_cap),
      peers: c.n,
      source: w === 0 ? 'market' : c.n >= C.shrink_peers ? cat : 'market-weighted',
    };
  }

  // The odds the protocol ever launches a token, from the category's base rate, smoothed by the whole
  // market's rate and discounted for age: a protocol that has run tokenless for years is less likely
  // to change than one listed last quarter.
  function oddsFor(p, ctx, age) {
    var cat = p.category || 'Other';
    var c = ctx.cats[cat] || { live: 0, total: 1 };
    var globalLive = ctx.global.n;
    var globalTotal = 0;
    Object.keys(ctx.cats).forEach(function (k) { globalTotal += ctx.cats[k].total; });
    var prior = globalTotal > 0 ? globalLive / globalTotal : 0.1;
    var w = C.shrink_peers;
    var rate = (c.live + prior * w) / (c.total + w);
    var years = (age === null ? C.unknown_age_days : age) / 365;
    var discount = clamp(1 - years * 0.08, 0.45, 1);
    return clamp(rate * discount, 0.02, 0.9);
  }

  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    var a = Date.parse(asOf + 'T00:00:00Z');
    var b = Date.parse(listedAt + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.floor((a - b) / 86400000));
  }

  // One protocol's value: TVL times the category's market multiple, moved by its own seven-day growth
  // and discounted for how long it has gone without a token. `low` and `high` are the same arithmetic
  // run at the peers' 25th and 75th percentile multiples, so the row carries its own error bar.
  function value(p, ctx) {
    var age = p.age_days === undefined || p.age_days === null ? ageDays(ctx.as_of, p.listed_at) : p.age_days;
    var m = multipleFor(p.category || 'Other', ctx);
    var growthPct = clamp(finite(p.change_7d, 0), C.growth_floor, C.growth_cap);
    var growthMult = 1 + (growthPct / 100) * C.growth_weight;
    var ageForModel = age === null ? C.unknown_age_days : age;
    var maturityMult = C.maturity_floor + (Math.min(Math.max(ageForModel, 0), C.maturity_days) / C.maturity_days) * C.maturity_range;
    var tvl = Math.max(1, finite(p.tvl_usd, 1));
    var implied = clamp(round(tvl * m.median * growthMult * maturityMult), 1, C.max_implied);
    // The range is the point value widened by the peers' own interquartile spread: a category whose
    // live tokens trade at wildly different multiples gets a wider bar, and no row can have a low
    // above its own value or a high below it.
    var spread = clamp(Math.log((m.q75 || m.median * 2) / (m.q25 || m.median / 2)) / 2, 0.3, 2);
    return {
      implied: implied,
      low: clamp(round(implied * Math.exp(-spread)), 1, C.max_implied),
      high: clamp(round(implied * Math.exp(spread)), 1, C.max_implied),
      multiple: round4(m.median),
      multiple_low: round4(m.q25),
      multiple_high: round4(m.q75),
      peers: m.peers,
      multiple_source: m.source,
      growth_pct: round4(growthPct),
      growth_multiplier: round4(growthMult),
      maturity_multiplier: round4(maturityMult),
      age_days: age,
      odds: round4(oddsFor(p, ctx, age)),
    };
  }

  // Gas, roughly, for one qualifying transaction on the chains the snapshot names. The plan uses the
  // protocol's first chain because that is where its TVL is; the table keeps the numbers honest.
  var GAS = {
    ethereum: 6, 'arbitrum': 0.6, base: 0.3, optimism: 0.3, polygon: 0.2, bsc: 0.3,
    avalanche: 0.5, solana: 0.05, tron: 0.4, sui: 0.1, aptos: 0.05, monad: 0.2,
    unichain: 0.3, 'robinhood chain': 0.3, katana: 0.2, arc: 0.2, corn: 0.4, hyperliquid: 0.3,
  };
  function gasFor(chain) {
    var key = String(chain || '').toLowerCase();
    return GAS[key] === undefined ? 1 : GAS[key];
  }

  // Capital one position needs: small enough that a farm is worth trying, scaled a little with the
  // protocol's own depth so a $3B protocol is not farmed with the same $50 as a $20M one.
  function capitalFor(tvl) {
    var raw = Math.pow(Math.max(tvl, 1e6), 0.5) / 12;
    return Math.round(clamp(raw, 40, 400) / 10) * 10;
  }

  // The farm plan: what to do, with what capital, at what cost, for how long, and what the model says
  // a wallet's slice is worth against the hours it takes. Every number comes from the row's own record.
  function farm(p, v) {
    var chain = p.chains && p.chains.length > 0 ? p.chains[0] : 'its first chain';
    var gas = gasFor(chain);
    var capital = capitalFor(finite(p.tvl_usd, 1e6));
    var age = v && v.age_days !== null && v.age_days !== undefined ? v.age_days : C.unknown_age_days;
    var hold = age < 180 ? 60 : age < 365 ? 45 : 30;
    var weeks = Math.max(4, Math.round(hold / 7));
    var gasTotal = gas * (2 + weeks); // entry, claim, and one qualifying action a week
    var odds = v && isFinite(v.odds) ? v.odds : 0.1;
    var implied = v && isFinite(v.implied) ? v.implied : finite(p.tvl_usd, 1e6) * 0.25;
    var gross = implied * C.airdrop_share * odds;
    var hours = 0.5 + weeks * 0.25;
    var netHour = Math.max(-999, Math.round((gross - gasTotal) / hours));
    var actions = actionFor(p, capital, chain);
    return [
      {
        text: 'Set up a fresh wallet for this farm only, funded with $' + Math.round(capital + gasTotal + 20) + ' of USDC and nothing else, and keep its seed phrase offline.',
        cost: '$' + Math.round(capital + gasTotal + 20) + ' of working capital, of which about $' + Math.round(gasTotal) + ' is gas',
        time: '10 minutes',
      },
      {
        text: actions,
        cost: '$' + capital + ' of capital and about $' + round(gas * 2) + ' of gas for the first transaction on ' + chain,
        time: '20 minutes',
      },
      {
        text: 'Repeat one qualifying action each week for ' + weeks + ' weeks, mixing the actions the protocol counts: a deposit, a borrow, a swap, a vote or a claim, and never a wash trade.',
        cost: 'about $' + round(gas * weeks) + ' of gas over ' + weeks + ' weeks',
        time: Math.round(weeks * 0.25 * 10) / 10 + ' hours in total, 15 minutes a week',
      },
      {
        text: 'Hold at least ' + hold + ' days so the position is counted in more than one snapshot; ' + (age > 365 ? 'this protocol is ' + Math.round(age / 365) + ' years old, so the window is short by design.' : 'this protocol is young, so a longer window is worth the wait.'),
        cost: '$' + capital + ' stays in the position, at the protocol\'s own risk',
        time: hold + ' days',
      },
      {
        text: 'Read the protocol\'s own docs for its token terms before the launch, and never pay a fee or share a seed phrase to claim: a real distribution takes gas, not a payment.',
        cost: 'no fee; about $' + round(gas * 2) + ' of gas to claim if a token arrives',
        time: '15 minutes of reading',
      },
      {
        text: 'Unwind at the exit the model implies: sell the claim when the position\'s value reaches the top of its $' + usd(v && v.low) + ' to $' + usd(v && v.high) + ' range, and unwind the position if the protocol\'s TVL halves.',
        cost: 'about $' + round(gas * 3) + ' of gas to exit and claim',
        time: '20 minutes',
      },
      {
        text: 'Log the wallet, each date and each transaction, then compare the realised value to the model: at ' + pct(odds) + ' launch odds against ' + usd(implied) + ' modelled value, this farm nets about $' + netHour + ' an hour over ' + Math.round(hours * 10) / 10 + ' hours.',
        cost: 'nothing but the log',
        time: '10 minutes',
      },
    ];
  }

  function usd(n) {
    if (!isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    return Math.round(n * 100) + '%';
  }

  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow a small amount against it so the position reads as a real user.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds inside its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and keep one small hedge open for the hold.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and keep one market position open through the hold.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it through the hold.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy open.';
    if (c.indexOf('yield aggregator') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' into ' + name + "'s top vault on " + chain + ' and leave it for the hold.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  // A step as the one string the board carries: action, then cost and time, inside the gate's 20..600.
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }

  root.RadarModel = {
    constants: C,
    version: C.version,
    isPreToken: isPreToken,
    isRankable: isRankable,
    ageDays: ageDays,
    comparables: comparables,
    multipleFor: multipleFor,
    value: value,
    farm: farm,
    stepText: stepText,
    usd: usd,
    pct: pct,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
