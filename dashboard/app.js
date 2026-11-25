(() => {
  'use strict';

  const data = window.RADAR;
  const content = document.getElementById('content');
  const stats = document.getElementById('stats');
  const footer = document.getElementById('footer');
  if (!data || !Array.isArray(data.rows) || !data.calibration) {
    content.innerHTML = '<section class="empty"><h1>Snapshot not found</h1><p>Open the generated out/dashboard/index.html beside out/data.js after running main.ts.</p></section>';
    return;
  }

  const rows = data.rows;
  const calibration = data.calibration;
  const bySlug = new Map(rows.map((row) => [row.slug, row]));
  const categoryName = (row) => row.category ?? 'Uncategorized';
  const categories = [...new Set(rows.map(categoryName))].sort(compareText);
  const chains = [...new Set(rows.flatMap((row) => row.chains))].sort(compareText);
  const sortOptions = [
    ['value-desc', 'Implied value ↓'], ['value-asc', 'Implied value ↑'],
    ['tvl-desc', 'TVL ↓'], ['tvl-asc', 'TVL ↑'],
    ['change-desc', '7-day change ↓'], ['change-asc', '7-day change ↑'],
    ['name-asc', 'Name A–Z'], ['name-desc', 'Name Z–A'],
  ];
  const fullDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  let state = readHash();

  function compareText(first, second) {
    return first < second ? -1 : first > second ? 1 : 0;
  }

  function escape(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  function money(value) {
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
    if (Math.abs(value) >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return fullDollars.format(value);
  }

  function multiple(value, precision = 2) {
    return `${value.toFixed(precision)}x`;
  }

  function change(value) {
    if (value === null) return '<span class="neutral" title="Not reported; model uses zero">—</span>';
    return `<span class="${value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'}">${value > 0 ? '+' : ''}${value.toFixed(2)}%</span>`;
  }

  function tier(row) {
    return `<span class="tier tier-${row.signal_tier}" title="Value-rank tier: S top 10, A ranks 11–40, B remaining">${row.signal_tier}</span>`;
  }

  function monogram(row) {
    const letters = row.name.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0] ?? '').join('').toUpperCase();
    return `<span class="monogram" aria-hidden="true">${escape(letters)}</span>`;
  }

  function readHash() {
    const raw = location.hash.slice(1);
    const params = new URLSearchParams(raw === 'board' || raw === 'methodology' ? '' : raw);
    const requestedSort = params.get('sort');
    return {
      view: raw === 'methodology' ? 'methodology' : params.has('p') ? 'detail' : 'board',
      slug: params.get('p') ?? '',
      q: params.get('q') ?? '',
      category: params.get('category') ?? '',
      chain: params.get('chain') ?? '',
      watchlist: params.get('watchlist') === '1',
      sort: sortOptions.some(([value]) => value === requestedSort) ? requestedSort : 'value-desc',
    };
  }

  function route(next = {}) {
    const target = { ...state, ...next };
    if (target.view === 'methodology') return '#methodology';
    const params = new URLSearchParams();
    if (target.view === 'detail') params.set('p', target.slug);
    if (target.q) params.set('q', target.q);
    if (target.category) params.set('category', target.category);
    if (target.chain) params.set('chain', target.chain);
    if (target.watchlist) params.set('watchlist', '1');
    if (target.sort !== 'value-desc') params.set('sort', target.sort);
    return params.size ? `#${params.toString()}` : '#board';
  }

  function updateBoard(next) {
    state = { ...state, ...next, view: 'board', slug: '' };
    history.replaceState(null, '', route());
    renderBoardResults();
    syncControls();
  }

  function filteredRows() {
    const query = state.q.trim().toLowerCase();
    return rows.filter((row) => (!query || `${row.name} ${row.slug} ${categoryName(row)} ${row.chains.join(' ')}`.toLowerCase().includes(query))
      && (!state.category || categoryName(row) === state.category)
      && (!state.chain || row.chains.includes(state.chain)) && (!state.watchlist || row.watchlist)).sort((first, second) => {
      const [field, direction] = state.sort.split('-');
      let comparison;
      if (field === 'name') comparison = compareText(first.name.toLowerCase(), second.name.toLowerCase());
      else if (field === 'change') {
        if (first.change_7d === null || second.change_7d === null) {
          if (first.change_7d !== second.change_7d) return first.change_7d === null ? 1 : -1;
          comparison = 0;
        } else comparison = first.change_7d - second.change_7d;
      } else comparison = field === 'tvl' ? first.tvl_usd - second.tvl_usd : first.implied_value_usd - second.implied_value_usd;
      return (direction === 'desc' ? -comparison : comparison) || first.rank - second.rank;
    });
  }

  function renderStats() {
    const watchlistCount = rows.filter((row) => row.watchlist).length;
    const total = rows.reduce((sum, row) => sum + row.implied_value_usd, 0);
    stats.innerHTML = [
      ['Protocols scanned', data.protocols_scanned, `${data.tokenized_count} token-recorded protocols set aside`],
      ['Pre-token candidates', data.pre_token_candidates, `${rows.length} ranked after observable exclusions`],
      ['Watchlist size', `${watchlistCount} / ${data.watchlist_size}`, `Full coverage · ${data.early_size} rows below ${money(data.floor_usd)}`],
      ['Total implied value', money(total), 'Sum of modeled values · not a token forecast'],
    ].map(([label, value, note]) => `<div class="stat"><span class="stat-label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></div>`).join('');
    footer.innerHTML = `<span><span class="dot"></span>SEALED SNAPSHOT · ${escape(data.as_of)} · OFFLINE BY DESIGN</span><span>No token recorded ≠ proof of no token. No launch or reward is guaranteed.</span>`;
  }

  function options(values, allLabel) {
    return `<option value="">${allLabel}</option>${values.map((value) => `<option value="${escape(value)}">${escape(value)}</option>`).join('')}`;
  }

  function renderBoard() {
    content.innerHTML = `<section class="hero"><div><p class="eyebrow">01 / DISCOVERY BOARD</p><h1>Before the ticker.</h1><p class="subtitle">Protocols with no token recorded, ranked by snapshot-derived implied value. Open any row for the math and the farm plan.</p></div><div class="snapshot-stamp"><span class="dot"></span>FROZEN, NOT LIVE<strong>${escape(data.as_of)} snapshot</strong></div></section>
      <section class="controls" aria-label="Board filters">
        <label class="control">Search<input id="search" type="search" placeholder="Protocol, category or chain…" autocomplete="off"></label>
        <label class="control">Category<select id="category">${options(categories, 'All categories')}</select></label>
        <label class="control">Chain<select id="chain">${options(chains, 'All chains')}</select></label>
        <label class="toggle"><input id="watchlist" type="checkbox">Watchlist only</label>
        <label class="control">Sort by<select id="sort">${sortOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></label>
        <button class="reset" id="reset" type="button">Reset</button>
      </section>
      <div id="results"></div><p class="board-note">Signal tiers measure value rank, not launch probability. TVL is not revenue; implied value is our model’s claim. <a href="#methodology">Read the methodology →</a></p>`;
    syncControls();
    document.getElementById('search').addEventListener('input', (event) => updateBoard({ q: event.target.value }));
    ['category', 'chain', 'sort'].forEach((key) => document.getElementById(key).addEventListener('change', (event) => updateBoard({ [key]: event.target.value })));
    document.getElementById('watchlist').addEventListener('change', (event) => updateBoard({ watchlist: event.target.checked }));
    document.getElementById('reset').addEventListener('click', resetBoard);
    document.getElementById('results').addEventListener('click', (event) => {
      const sortButton = event.target.closest('[data-sort]');
      if (sortButton) {
        const field = sortButton.dataset.sort;
        const initialDirection = field === 'name' ? 'asc' : 'desc';
        const nextDirection = state.sort === `${field}-desc` ? 'asc' : state.sort === `${field}-asc` ? 'desc' : initialDirection;
        updateBoard({ sort: `${field}-${nextDirection}` });
      }
      if (event.target.closest('[data-reset]')) resetBoard();
    });
    renderBoardResults();
  }

  function resetBoard() {
    updateBoard({ q: '', category: '', chain: '', watchlist: false, sort: 'value-desc' });
  }

  function syncControls() {
    for (const key of ['category', 'chain', 'sort']) document.getElementById(key).value = state[key];
    document.getElementById('search').value = state.q;
    document.getElementById('watchlist').checked = state.watchlist;
  }

  function sortHeading(label, field) {
    const active = state.sort.startsWith(`${field}-`);
    const direction = state.sort.endsWith('-desc') ? 'descending' : 'ascending';
    return `<th class="${field === 'name' ? '' : 'num'} ${active ? 'sorted' : ''}" aria-sort="${active ? direction : 'none'}"><button type="button" data-sort="${field}">${label}${active ? direction === 'descending' ? ' ↓' : ' ↑' : ''}</button></th>`;
  }

  function renderBoardResults() {
    const visible = filteredRows();
    const subsetValue = visible.reduce((sum, row) => sum + row.implied_value_usd, 0);
    const selected = [state.category, state.chain, state.watchlist ? 'Watchlist' : '', state.q ? `“${state.q}”` : ''].filter(Boolean);
    const meta = `<div class="board-meta"><span><strong>${visible.length} / ${rows.length} protocols</strong>${selected.length ? ` · ${escape(selected.join(' / '))}` : ' · all eligible candidates'} · ${money(subsetValue)} implied in view</span><div class="legend">${tier({ signal_tier: 'S' })}<span>Top 10</span>${tier({ signal_tier: 'A' })}<span>11–40</span>${tier({ signal_tier: 'B' })}<span>41+ · ranks stay global</span></div></div>`;
    if (!visible.length) {
      document.getElementById('results').innerHTML = `${meta}<div class="panel empty"><h2>No protocols match these filters</h2><p>Try a broader category, chain or search.</p><button type="button" class="reset" data-reset>Clear filters</button></div>`;
      return;
    }
    document.getElementById('results').innerHTML = `${meta}<div class="table-wrap"><table aria-label="Ranked pre-token protocols"><thead><tr><th>Rank</th>${sortHeading('Protocol', 'name')}<th>Category</th><th>Chains</th>${sortHeading('TVL', 'tvl')}${sortHeading('7d change', 'change')}${sortHeading('Implied value', 'value')}<th class="num">Multiple</th><th class="num">Tier</th></tr></thead><tbody>${visible.map(boardRow).join('')}</tbody></table></div>`;
  }

  function boardRow(row) {
    const primary = row.chains[0] ?? 'Unreported';
    return `<tr><td class="rank">${String(row.rank).padStart(2, '0')}</td><td><a class="protocol" href="${escape(route({ view: 'detail', slug: row.slug }))}">${monogram(row)}<span><span class="protocol-name">${escape(row.name)}</span><small>${row.watchlist ? '<span class="watch-dot">●</span> Watchlist' : row.below_floor ? 'Below-floor discovery' : 'Extended candidate'} · no token recorded</small></span></a></td><td><span class="category-text" title="${escape(categoryName(row))}">${escape(categoryName(row))}</span></td><td title="${escape(row.chains.join(', '))}"><span class="chain-chip">${escape(primary)}</span>${row.chains.length > 1 ? `<span class="chain-extra">+${row.chains.length - 1}</span>` : ''}</td><td class="num" title="${fullDollars.format(row.tvl_usd)}">${money(row.tvl_usd)}</td><td class="num">${change(row.change_7d)}</td><td class="num value" title="${fullDollars.format(row.implied_value_usd)}">${money(row.implied_value_usd)}</td><td class="num" title="Implied value divided by TVL">${multiple(row.implied_multiple)}</td><td class="num">${tier(row)}</td></tr>`;
  }

  function splitStep(step) {
    const costAt = step.lastIndexOf(' Cost: ');
    const timeAt = step.lastIndexOf(' Time: ');
    if (costAt < 0 || timeAt < costAt) return { action: step, cost: '', time: '' };
    return { action: step.slice(0, costAt), cost: step.slice(costAt + 7, timeAt), time: step.slice(timeAt + 7) };
  }

  function renderDetail() {
    const row = bySlug.get(state.slug);
    if (!row) {
      content.innerHTML = `<section class="empty"><h1>Protocol not on this board</h1><p>The route may refer to an excluded or unknown snapshot slug.</p><a class="back" href="${escape(route({ view: 'board' }))}">← Back to board</a></section>`;
      return;
    }
    const model = row.model;
    const categoryPeers = rows.filter((peer) => peer.category === row.category);
    const peerPreview = categoryPeers.slice(0, 5);
    if (!peerPreview.some((peer) => peer.slug === row.slug)) peerPreview.push(row);
    const stepTitles = ['Verify & fund', 'Make the first position', 'Maintain & test an exit', 'Track the launch signal', 'Set the risk boundary'];
    const factors = [
      ['Snapshot TVL', money(row.tvl_usd), fullDollars.format(row.tvl_usd)],
      ['Category multiple', multiple(model.category_multiple, 6), `${model.category_n} usable tokenized peers`],
      ['Momentum', multiple(model.momentum, 6), `${row.change_7d === null ? 'Missing → 0' : model.change_7d_used.toFixed(4)}% change`],
      ['Seasoning', multiple(model.seasoning, 6), `${model.age_days} days since listing`],
      ['Reach', multiple(model.reach, 6), `${model.chain_count} listed chains`],
      ['Implied value', money(row.implied_value_usd), `${multiple(row.implied_multiple)} of TVL`],
    ];
    content.innerHTML = `<a class="back" href="${escape(route({ view: 'board' }))}">← Back to ${state.category || state.chain || state.q || state.watchlist ? 'filtered ' : ''}board</a>
      <section class="hero detail-hero"><div><p class="eyebrow">02 / PROTOCOL DOSSIER · GLOBAL RANK ${row.rank}</p><div class="detail-title">${monogram(row)}<h1>${escape(row.name)}</h1>${tier(row)}</div><div><span class="badge badge-accent">${row.watchlist ? 'Watchlist' : row.below_floor ? 'Below-floor discovery' : 'Extended candidate'}</span><span class="badge">${escape(categoryName(row))}</span>${row.chains.map((chain) => `<span class="badge">${escape(chain)}</span>`).join('')}<span class="badge">No token recorded</span></div></div><div class="detail-value"><span class="overline">Implied token value / model claim</span><strong title="${fullDollars.format(row.implied_value_usd)}">${fullDollars.format(row.implied_value_usd)}</strong><small>TVL ${money(row.tvl_usd)} · 7d ${change(row.change_7d)} · ${multiple(row.implied_multiple)} implied / TVL</small></div></section>
      <section class="panel"><div class="panel-heading"><h2>The valuation, unpacked</h2><small>Snapshot-only · round to whole dollars, minimum $1</small></div><div class="formula">${factors.map(([label, value, note], index) => `<div class="factor"><span class="overline">${label}</span><strong class="${index === 5 ? 'positive' : ''}">${value}</strong><small>${escape(note)}</small></div>`).join('')}</div><p class="model-note">Extreme ratios are clipped to the middle half of all ratios before category medians are taken. Category shrinkage uses 8 raw global-median observations. Age reference: latest snapshot listing ${escape(calibration.latest_listed_at ?? 'unreported')}, not today. Factors displayed to 6 decimals; the calculation uses full precision.</p><details><summary>Full-precision calculation</summary><code>max(1, round(${row.tvl_usd} × ${model.category_multiple} × ${model.momentum} × ${model.seasoning} × ${model.reach})) = ${row.implied_value_usd} USD<br>Before rounding: ${model.unrounded_value_usd} USD</code></details></section>
      <div class="detail-grid"><section class="panel"><div class="panel-heading"><h2>A practical farm plan</h2><small>5 steps · primary chain: ${escape(row.chains[0] ?? 'unreported')}</small></div><ol class="farm-list">${row.farm_steps.map((step, index) => {
        const parts = splitStep(step);
        return `<li class="farm-step"><span class="step-number">0${index + 1}</span><div><h3>${stepTitles[index]}</h3><p>${escape(parts.action)}</p><div class="step-budget"><span><b>Cost:</b> ${escape(parts.cost)}</span><span><b>Time:</b> ${escape(parts.time)}</span></div></div></li>`;
      }).join('')}</ol><p class="caution">These are estimated, conditional playbooks, not verified eligibility. Verify supported actions and fees in the official documentation; no points program or airdrop is asserted by the snapshot.</p></section>
      <aside class="side-stack"><section class="panel"><h2>${escape(categoryName(row))} peers</h2><div class="peer-stats"><div><strong>#${row.category_rank} / ${row.category_size}</strong><small>Implied-value rank within board category</small></div><div><strong>${model.category_median === null ? '—' : multiple(model.category_median, 3)}</strong><small>Clipped tokenized category median · n=${model.category_n}</small></div></div><ul class="peer-list">${peerPreview.map((peer) => `<li class="${peer.slug === row.slug ? 'selected' : ''}"><a href="${escape(route({ view: 'detail', slug: peer.slug }))}"><span class="rank">#${peer.category_rank}</span><span class="peer-name">${escape(peer.name)}</span><span class="peer-value">${money(peer.implied_value_usd)}</span></a></li>`).join('')}</ul><a class="peer-all" href="${escape(route({ view: 'board', category: categoryName(row), q: '', chain: '', watchlist: false, sort: 'value-desc' }))}">Explore all ${row.category_size} category candidates →</a></section>
      <section class="panel"><h2>Calibration & record</h2><dl class="brief-list"><div><dt>Global median / usable ratios</dt><dd>${multiple(calibration.global_median, 6)} / ${calibration.global_n}</dd></div><div><dt>Shrunk category multiple</dt><dd>${multiple(model.category_multiple, 6)}</dd></div><div><dt>First tracked</dt><dd>${escape(row.listed_at ?? 'Unreported; age uses 0')}</dd></div><div><dt>Seasoning age</dt><dd>${model.age_days} days / 720-day ramp</dd></div><div><dt>Momentum bounds</dt><dd>0.70x to 1.50x</dd></div><div><dt>Reach cap</dt><dd>1.10x</dd></div></dl><p class="caution">${model.category_n === 0 ? 'No usable category ratios: the global median is the fallback. ' : model.category_n < 5 ? 'Sparse category sample: shrinkage reduces single-peer influence. ' : ''}Listed age is tracking age, not proof of time without a token. Implied value is not liquid market capitalization.</p><a class="peer-all" href="#methodology">Read the complete methodology →</a></section></aside></div>`;
  }

  function renderMethodology() {
    const boardCategories = calibration.categories.filter((group) => rows.some((row) => row.category === group.category));
    content.innerHTML = `<a class="back" href="#board">← Back to discovery board</a><section class="hero"><div><p class="eyebrow">03 / METHODOLOGY</p><h1>One snapshot. An inspectable model.</h1><p class="subtitle">Every input figure and valuation derives from the sealed snapshot alone. No live prices, hardcoded protocol scores or token-launch predictions.</p></div><div class="snapshot-stamp"><span class="dot"></span>MODEL VERSION<strong>${escape(data.model_version)}</strong></div></section>
      <div class="method-grid"><div><section class="panel"><h2>How implied value is built</h2><code class="formula-code">implied USD = max(1, round(TVL × category multiple × momentum × seasoning × reach))</code><p><b>Shrinkage:</b> blend each category’s median market-cap/TVL ratio with eight global-median observations, reducing small-peer influence.</p><ol>
        <li><b>Category multiple:</b> (n × category median + 8 × global median) / (n + 8). Tokenized means either gecko_id or symbol is recorded. Only finite, strictly positive reported market caps and positive TVL enter the medians; zeros and missing caps are excluded. Extreme ratios are clipped to the middle half of all ratios before category medians are taken. The global median uses the original, unclipped ratios. A category with no usable ratios uses the global median.</li>
        <li><b>Momentum:</b> clamp(1 + change_7d / 100, 0.7, 1.5). Unreported seven-day change counts as 0. Growth is TVL change, not price performance.</li>
        <li><b>Seasoning:</b> 0.8 + 0.4 × min(age_days / 720, 1). Age is the day difference between listed_at and the latest listed_at in the snapshot (${escape(calibration.latest_listed_at ?? 'none')}); missing listing dates use age 0.</li>
        <li><b>Reach:</b> min(1 + 0.02 × (number of chains − 1), 1.10). Chain count is the snapshot array’s length, not a claim about users.</li>
        <li><b>Ranking:</b> whole-dollar implied value descending, then TVL descending, then slug ascending. Ranks stay 1..N even in filtered or differently sorted views. S covers the top 10; A covers ranks 11–40; B covers the rest. These are value tiers, not launch signals.</li>
      </ol></section><section class="panel"><h2>What is included — and what is not known</h2><p>All ${data.watchlist_size} authoritative watchlist protocols are retained. Additional candidates record no token (both gecko_id and symbol null), pass the observable category and name exclusions, and may sit below the ${money(data.floor_usd)} watchlist floor. This run ranks ${rows.length} protocols, including ${data.early_size} below the floor.</p><p class="caution">Exclude Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX; whole-word wrapped/staked/staking products; version-suffixed names; and names starting with Binance, Coinbase, Bybit, Kraken, Bitget, OKX, Bitfinex or Gemini. The snapshot lacks parentProtocol, so parent independence cannot be verified for extended candidates. If candidates exceed 240, keep every watchlist row and fill remaining slots by implied value.</p></section><section class="panel"><h2>Farm plans are playbooks, not snapshot facts</h2><p>Five conditional steps per protocol use its name, first listed chain, category and TVL tier. Large TVL (≥$1B) budgets $250 over 4 weeks; mid TVL (≥$50M) budgets $100 over 6 weeks; smaller TVL budgets $50 over 8 weeks. Capital is a risk budget, not a reward estimate. Gas estimates are authored assumptions, not fields from the snapshot: Ethereum $8–$35 per transaction, Base $0.05–$0.50, Arbitrum/Optimism $0.10–$1, Solana $0.01–$0.20; unspecified chains $0.25–$3. Verify current fees and supported actions before use.</p><p class="caution">TVL is not revenue. Peer ratios have selection bias and sparse coverage. Tracking age is not operating age. No launch date, points eligibility or future return is known. “No token recorded” is a data classification, not proof that a token does not exist.</p></section></div>
      <aside><section class="panel"><h2>Calibration from this run</h2><div class="peer-stats"><div><strong>${multiple(calibration.global_median, 6)}</strong><small>Global median market cap / TVL</small></div><div><strong>${calibration.global_n}</strong><small>Usable positive tokenized ratios</small></div></div><dl class="brief-list"><div><dt>Global 25th percentile</dt><dd>${multiple(calibration.global_p25, 6)}</dd></div><div><dt>Global 75th percentile</dt><dd>${multiple(calibration.global_p75, 6)}</dd></div><div><dt>Snapshot protocols scanned</dt><dd>${data.protocols_scanned}</dd></div><div><dt>Token-recorded protocols excluded</dt><dd>${data.tokenized_count}</dd></div></dl><p class="caution">Medians and quantiles use linear interpolation at (n − 1) × p. The category table is computed at runtime from snapshot records, never a hardcoded multiple table.</p></section><section class="panel"><h2>Board category multiples</h2><div class="table-wrap"><table class="calibration-table" aria-label="Runtime category calibration"><thead><tr><th>Category</th><th class="num">n</th><th class="num">Median</th><th class="num">Shrunk</th></tr></thead><tbody>${boardCategories.map((group) => `<tr><td>${escape(group.category ?? 'Uncategorized')}</td><td class="num">${group.n}</td><td class="num">${group.median === null ? '—' : multiple(group.median, 3)}</td><td class="num positive">${multiple(group.multiple, 3)}</td></tr>`).join('')}</tbody></table></div></section></aside></div>`;
  }

  function render() {
    state = readHash();
    document.body.dataset.view = state.view;
    document.getElementById('board-link').classList.toggle('active', state.view !== 'methodology');
    document.getElementById('method-link').classList.toggle('active', state.view === 'methodology');
    if (state.view === 'detail') renderDetail();
    else if (state.view === 'methodology') renderMethodology();
    else renderBoard();
    document.title = state.view === 'detail' && bySlug.has(state.slug)
      ? `${bySlug.get(state.slug).name} — Pre-Token Radar` : state.view === 'methodology' ? 'Methodology — Pre-Token Radar' : 'Pre-Token Radar — Before the ticker';
  }

  renderStats();
  render();
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
})();
