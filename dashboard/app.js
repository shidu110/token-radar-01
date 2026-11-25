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
  const categories = data.category_rates.map((group) => group.category ?? 'Uncategorized');
  const chains = [...new Set(rows.flatMap((row) => row.chains))].sort(compareText);
  const sortOptions = [
    ['value-desc', 'Implied value ↓'], ['value-asc', 'Implied value ↑'],
    ['tvl-desc', 'TVL ↓'], ['tvl-asc', 'TVL ↑'],
    ['change-desc', '7-day change ↓'], ['change-asc', '7-day change ↑'],
    ['name-asc', 'Name A–Z'], ['name-desc', 'Name Z–A'],
  ];
  const fullDollars = { format: (value) => `$${Math.round(value).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` };
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

  function usd(value) {
    return `$${value.toFixed(2)}`;
  }

  function totalTime(minutes) {
    if (minutes < 120) return `${minutes} minutes`;
    return `${(minutes / 60).toFixed(1).replace(/\.0$/, '')} hours`;
  }

  function percent(value, precision = 1) {
    return `${(value * 100).toFixed(precision)}%`;
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
      return (direction === 'desc' ? -comparison : comparison) || first.rank - second.rank || compareText(first.slug, second.slug);
    });
  }

  function renderStats() {
    const summary = data.board_summary;
    stats.innerHTML = [
      ['Protocols ranked', summary.protocols_ranked, `${data.protocols_scanned} scanned · ${data.pre_token_candidates} record no token`],
      ['Watchlist coverage', `${summary.watchlist_covered} / ${summary.watchlist_total}`, `${data.early_size} discoveries below ${money(data.floor_usd)}`],
      ['Median implied value', money(summary.median_implied_value_usd), 'Middle of the ranked board · model claim'],
      ['Total implied value', money(summary.total_implied_value_usd), 'Sum of modeled values · not a forecast'],
      ['Snapshot date', summary.snapshot_date, 'Sealed data · no live updates'],
    ].map(([label, value, note]) => `<div class="stat"><span class="stat-label">${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(note)}</small></div>`).join('');
    footer.innerHTML = `<span><span class="dot"></span>SEALED SNAPSHOT · ${escape(data.as_of)} · OFFLINE BY DESIGN</span><span>No token recorded ≠ proof of no token. No launch or reward is guaranteed.</span>`;
  }

  function options(values, allLabel) {
    return `<option value="">${allLabel}</option>${values.map((value) => `<option value="${escape(value)}">${escape(value)}</option>`).join('')}`;
  }

  function renderCategoryPills() {
    const pills = [{ name: 'All', value: '', rate: null }, ...data.category_rates.map((group) => ({
      name: group.category ?? 'Uncategorized', value: group.category ?? 'Uncategorized', rate: group,
    }))];
    document.getElementById('category-pills').innerHTML = pills.map((pill) => {
      const active = state.category === pill.value;
      const note = pill.rate ? `${pill.rate.tokenized_count} / ${pill.rate.snapshot_count} snapshot protocols record a token identifier or positive market cap` : 'Clear only the category filter';
      return `<button type="button" class="category-pill${active ? ' active' : ''}" data-category="${escape(pill.value)}" aria-pressed="${active}" title="${escape(note)}">${escape(pill.name)}${pill.rate ? `<span>${pill.rate.tokenization_rate_percent.toFixed(1)}%</span>` : ''}</button>`;
    }).join('');
  }

  function renderBoard() {
    content.innerHTML = `<section class="hero"><div><p class="eyebrow">01 / DISCOVERY BOARD</p><h1>Before the ticker.</h1><p class="subtitle">Protocols with no token recorded, ranked by snapshot-derived implied value. Open any row for the math and the farm plan.</p></div><div class="snapshot-stamp"><span class="dot"></span>FROZEN, NOT LIVE<strong>${escape(data.as_of)} snapshot</strong></div></section>
      <div id="category-pills" class="category-pills" role="group" aria-label="Filter by category and snapshot tokenization rate"></div>
      <p class="pill-note">Tokenization rate = token identifier or positive market cap recorded / all snapshot protocols in that category. Not launch odds.</p>
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
    document.getElementById('category-pills').addEventListener('click', (event) => {
      const pill = event.target.closest('[data-category]');
      if (pill) updateBoard({ category: pill.dataset.category });
    });
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
    renderCategoryPills();
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

  function valuationRange(row) {
    const span = row.bull_usd - row.bear_usd;
    const basePosition = span > 0 ? ((row.implied_value_usd - row.bear_usd) / span) * 100 : 50;
    return `<div class="range-block"><div class="range-labels"><span><b>Bear</b> ${money(row.bear_usd)}</span><span class="range-base"><b>Base</b> ${money(row.implied_value_usd)}</span><span><b>Bull</b> ${money(row.bull_usd)}</span></div><div class="range-bar" role="img" aria-label="Bear ${money(row.bear_usd)}, base ${money(row.implied_value_usd)}, bull ${money(row.bull_usd)}"><span class="range-fill"></span><span class="range-pin" style="left:${Math.max(1, Math.min(99, basePosition)).toFixed(1)}%"></span></div><small>C's LOO residual p25/p75 apply ${Math.exp(calibration.residual_p25).toFixed(4)}x / ${Math.exp(calibration.residual_p75).toFixed(4)}x to Base: scenario ranges, not confidence or reward forecasts.</small></div>`;
  }

  function comparablesPanel(row) {
    const globalFallback = `No usable tokenized peer in this category; the category multiple falls back to the TVL-weighted global median ${multiple(calibration.global_median, 4)}.`;
    const table = row.comps.length === 0 ? `<p class="caution compact">${escape(globalFallback)}</p>` : `<div class="table-wrap"><table class="comp-table" aria-label="Tokenized comparables"><thead><tr><th>Peer</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">mcap / TVL</th></tr></thead><tbody>${row.comps.map((peer) => `<tr><td>${escape(peer.name)}</td><td class="num">${money(peer.tvl_usd)}</td><td class="num">${money(peer.mcap_usd)}</td><td class="num positive">${peer.ratio.toFixed(3)}x</td></tr>`).join('')}</tbody></table></div>`;
    return `<section class="panel comps-panel"><div class="panel-heading"><div><h2>Tokenized comparables — where the multiple comes from</h2><small>Up to five same-category tokenized peers nearest this protocol by log TVL</small></div><div class="subject-multiple"><span class="overline">This protocol</span><strong>${multiple(row.implied_multiple, 3)}</strong><small>implied / TVL</small></div></div>${table}</section>`;
  }

  function renderDetail() {
    const row = bySlug.get(state.slug);
    if (!row) {
      content.innerHTML = `<section class="empty"><h1>Protocol not on this board</h1><p>The route may refer to an excluded or unknown snapshot slug.</p><a class="back" href="${escape(route({ view: 'board' }))}">← Back to board</a></section>`;
      return;
    }
    const model = row.model;
    const signals = row.signals;
    const signalValues = [
      ['Tracking age', signals.age_days === null ? 'Unreported' : `${signals.age_days} days · ${signals.age_years.toFixed(2)} years`],
      ['Listed chains', String(signals.chain_count)],
      ['TVL / category median', multiple(signals.tvl_vs_category_median)],
      ['7d momentum', signals.momentum_percent === null ? 'Unreported' : `${signals.momentum_direction} · ${signals.momentum_percent > 0 ? '+' : ''}${signals.momentum_percent.toFixed(2)}%`],
      ['Watchlist', signals.watchlist ? 'Yes' : 'No'],
    ];
    const categoryPeers = rows.filter((peer) => peer.category === row.category);
    const peerPreview = categoryPeers.slice(0, 5);
    if (!peerPreview.some((peer) => peer.slug === row.slug)) peerPreview.push(row);
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
      <section class="panel signals-panel" aria-label="Snapshot data-quality signals"><h2>Signals</h2><dl class="signal-values">${signalValues.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl><p class="model-note">Tracking age reference: ${escape(signals.age_reference ?? 'unreported')} (latest snapshot listing; 365.25 days/year). Category TVL median ${fullDollars.format(signals.category_median_tvl_usd)} uses all snapshot protocols in ${escape(categoryName(row))}. Missing momentum is not flat; these signals do not establish eligibility.</p></section>
      <section class="panel"><div class="panel-heading"><h2>The valuation, unpacked</h2><small>Snapshot-only · round to whole dollars, minimum $1</small></div><div class="formula">${factors.map(([label, value, note], index) => `<div class="factor"><span class="overline">${label}</span><strong class="${index === 5 ? 'positive' : ''}">${value}</strong><small>${escape(note)}</small></div>`).join('')}</div>${valuationRange(row)}<p class="model-note">Variant ${escape(calibration.variant)} (${escape(calibration.variant_label.toLowerCase())}) uses TVL-weighted category and global medians; shrinkage uses peer count n and global weight 8, not summed TVL. Age reference: latest snapshot listing ${escape(calibration.latest_listed_at ?? 'unreported')}, not today. Factors displayed to 6 decimals; the calculation uses full precision.</p><details><summary>Full-precision calculation</summary><code>max(1, round(${row.tvl_usd} × ${model.category_multiple} × ${model.momentum} × ${model.seasoning} × ${model.reach})) = ${row.implied_value_usd} USD<br>Before rounding: ${model.unrounded_value_usd} USD</code></details></section>
      ${comparablesPanel(row)}
      <div class="detail-grid"><section class="panel"><div class="panel-heading"><div><h2>A practical farm plan</h2><small>${row.farm_steps.length} steps · primary chain: ${escape(row.chains[0] ?? 'unreported')}</small></div><div class="plan-total"><span class="overline">Plan summary</span><strong>Estimated total: ${usd(row.totals.cost_low)}-${usd(row.totals.cost_high)} · about ${totalTime(row.totals.total_minutes)} across ${row.farm_steps.length} steps</strong></div></div><ol class="farm-list">${row.farm_steps.map((step, index) => {
        const parts = splitStep(step);
        const meta = row.steps_meta[index];
        return `<li class="farm-step"><span class="step-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${escape(meta.title)}</h3><p>${escape(parts.action)}</p><div class="step-budget"><span><b>Cost:</b> ${escape(parts.cost)}</span><span><b>Time:</b> ${escape(parts.time)}</span></div></div></li>`;
      }).join('')}</ol><p class="caution">The estimated total counts primary-chain gas only; capital is reused, not spent again each step. Fees, slippage and secondary-chain gas are excluded. These are conditional playbooks, not verified eligibility; verify documentation before signing. No points program or airdrop is asserted.</p></section>
      <aside class="side-stack"><section class="panel"><h2>Pre-token peers in this category</h2><div class="peer-stats"><div><strong>#${row.category_rank} / ${row.category_size}</strong><small>Implied-value rank within board category</small></div><div><strong>${model.category_median === null ? '—' : multiple(model.category_median, 3)}</strong><small>Clipped category TVL-weighted median · n=${model.category_n}</small></div></div><ul class="peer-list">${peerPreview.map((peer) => `<li class="${peer.slug === row.slug ? 'selected' : ''}"><a href="${escape(route({ view: 'detail', slug: peer.slug }))}"><span class="rank">#${peer.category_rank}</span><span class="peer-name">${escape(peer.name)}</span><span class="peer-value">${money(peer.implied_value_usd)}</span></a></li>`).join('')}</ul><a class="peer-all" href="${escape(route({ view: 'board', category: categoryName(row), q: '', chain: '', watchlist: false, sort: 'value-desc' }))}">Explore all ${row.category_size} category candidates →</a></section>
      <section class="panel"><h2>Calibration & record</h2><dl class="brief-list"><div><dt>TVL-weighted global median / ratios</dt><dd>${multiple(calibration.global_median, 6)} / ${calibration.global_n}</dd></div><div><dt>Shrunk category multiple</dt><dd>${multiple(model.category_multiple, 6)}</dd></div><div><dt>First tracked</dt><dd>${escape(row.listed_at ?? 'Unreported; age uses 0')}</dd></div><div><dt>Seasoning age</dt><dd>${model.age_days} days / 720-day ramp</dd></div><div><dt>Momentum bounds</dt><dd>0.70x to 1.50x</dd></div><div><dt>Reach cap</dt><dd>1.10x</dd></div></dl><p class="caution">${model.category_n === 0 ? 'No usable category ratios: the TVL-weighted global median is the fallback. ' : model.category_n < 5 ? 'Sparse category sample: shrinkage reduces single-peer influence. ' : ''}Listed age is tracking age, not proof of time without a token. Implied value is not liquid market capitalization.</p><a class="peer-all" href="#methodology">Read the complete methodology →</a></section></aside></div>`;
  }

  function renderMethodology() {
    const boardCategories = calibration.categories.filter((group) => rows.some((row) => row.category === group.category));
    const topCategories = [...boardCategories].map((group) => ({
      group,
      boardTvl: rows.filter((row) => row.category === group.category).reduce((total, row) => total + row.tvl_usd, 0),
      count: rows.filter((row) => row.category === group.category).length,
      slug: rows.filter((row) => row.category === group.category).map((row) => row.slug).sort(compareText)[0],
    })).sort((first, second) => second.boardTvl - first.boardTvl || compareText(first.slug, second.slug)).slice(0, 7);
    const maxMultiple = Math.max(...topCategories.map((entry) => entry.group.multiple), 0.000001);
    const variantRows = calibration.backtest.variants.map((variant) => `<tr class="${variant.variant === calibration.variant ? 'chosen-row' : ''}"><td>${escape(variant.label)}${variant.variant === calibration.variant ? ' <span class="chosen-tag">shipped</span>' : ''}</td><td class="num">${percent(variant.mdape)}</td><td class="num">${percent(variant.within_2x)}</td><td class="num">${variant.log_r2.toFixed(3)}</td></tr>`).join('');
    const residualRange = `<div class="residual-grid"><div><span class="overline">Residual p25</span><strong>${calibration.residual_p25.toFixed(6)}</strong><small>exp = ${Math.exp(calibration.residual_p25).toFixed(4)}x</small></div><div><span class="overline">Residual p75</span><strong>${calibration.residual_p75.toFixed(6)}</strong><small>exp = ${Math.exp(calibration.residual_p75).toFixed(4)}x</small></div><div><span class="overline">Chosen variant</span><strong>${escape(calibration.variant)}</strong><small>${calibration.backtest.mdape_gap_pp.toFixed(3)} pp MdAPE gap</small></div></div>`;
    const auditRows = rows.filter((row) => row.rank <= 10).toSorted((first, second) => first.rank - second.rank).map((row) => `<tr><td>#${row.rank}</td><td><a href="${escape(route({ view: 'detail', slug: row.slug }))}">${escape(row.name)}</a></td><td class="num">${fullDollars.format(row.tvl_usd)}</td><td>${escape(categoryName(row))}</td><td class="num" title="${row.model.category_multiple}">${multiple(row.model.category_multiple, 6)}</td><td class="num" title="${row.model.momentum}">${multiple(row.model.momentum, 6)}</td><td class="num positive">${fullDollars.format(row.implied_value_usd)}</td></tr>`).join('');
    content.innerHTML = `<a class="back" href="#board">← Back to discovery board</a><section class="hero"><div><p class="eyebrow">03 / METHODOLOGY</p><h1>One snapshot. An inspectable model.</h1><p class="subtitle">Every figure derives from the sealed snapshot. No live prices, hardcoded scores or launch predictions.</p></div><div class="snapshot-stamp"><span class="dot"></span>MODEL VERSION<strong>${escape(data.model_version)}</strong></div></section>
      <section class="panel calibration-panel"><div class="panel-heading"><div><h2>Calibration — leave-one-out evidence</h2><small>A/B/C each hold out one of 128 usable protocols and refit on 127; predictions are unrounded, not in-sample.</small></div><div class="calibration-kpis"><div><span class="overline">TVL-weighted median / n</span><strong>${multiple(calibration.global_median, 4)}</strong><small>${calibration.global_n} usable ratios</small></div><div><span class="overline">Within 2x</span><strong>${percent(calibration.backtest.variants.find((variant) => variant.variant === calibration.variant).within_2x)}</strong><small>chosen variant</small></div></div></div>
      <div class="calibration-grid"><div><div class="table-wrap"><table class="calibration-table" aria-label="A/B/C calibration backtest"><thead><tr><th>Variant</th><th class="num">MdAPE</th><th class="num">Within 2x</th><th class="num">Log R²</th></tr></thead><tbody>${variantRows}</tbody></table></div><p class="calibration-reason"><b>Shipped ${escape(calibration.variant)}.</b> ${escape(calibration.backtest.reason)} A: unweighted medians, 93.05% MdAPE (top-half 157.6%, top-10 520.8%); B: log-space p5-p95 winsorize, 94.21%; C: TVL-weighted medians, 89.24% (top-half 87.4%, top-10 79.9%). Size cohorts score each variant's full LOO residuals using phase-5 TVL-ranked memberships, never size-restricted fits. Unweighted medians let many small protocols set the multiple applied to the largest ones; weighting peers by TVL removes most of that size bias on this snapshot. Each fold excludes the target from clips and medians; shrinkage stays k=8. All other constants (momentum clamp 0.7–1.5, seasoning horizon 720d, reach +0.02/chain capped 1.10) were checked in an 18-cell leave-one-out grid on A; shipped values sit within 0.5pp of the best cell in every dimension.</p>${residualRange}<p class="model-note">Residual = ln(predicted / actual). MdAPE is median absolute percentage error; within 2x means 0.5–2x actual; log R² = 1 − SSE / SST around mean ln(actual). Quantiles use unweighted nearest rank. C's medians select the smallest clipped ratio reaching ≥50% cumulative peer TVL; A/B and error medians average central observations. Intervals apply exp(residual p25/p75) to Base: scenario ranges, not confidence or reward forecasts. This is sealed-snapshot evidence, not out-of-sample validation.</p></div>
      <div><h3 class="subhead">Top board categories by TVL</h3><div class="multiple-bars">${topCategories.map((entry) => `<div class="multiple-bar"><div class="bar-label"><span>${escape(entry.group.category ?? 'Uncategorized')}</span><span>${entry.count} protocols · ${multiple(entry.group.multiple, 3)}</span></div><div class="bar-track"><span style="width:${Math.max(2, (entry.group.multiple / maxMultiple) * 100).toFixed(1)}%"></span></div></div>`).join('')}</div><p class="model-note">Bar length is the shipped category multiple, scaled to the largest shown. Counts are board protocols, not calibration observations.</p></div></div></section>
      <section class="panel audit-panel"><div class="panel-heading"><div><h2>Top-10 ranking audit</h2><small>The actual board leaders, with the category multiple and momentum applied to each snapshot TVL.</small></div></div><div class="table-wrap"><table class="audit-table" aria-label="Top-10 valuation audit"><thead><tr><th>Rank</th><th>Protocol</th><th class="num">TVL</th><th>Category</th><th class="num">Category multiple</th><th class="num">Momentum factor</th><th class="num">Implied value</th></tr></thead><tbody>${auditRows}</tbody></table></div><p class="model-note">Dollar amounts are exact. Factors show six decimals; hover for full precision. Seasoning and reach also apply: open a protocol for its complete calculation. Global rank uses implied value, then TVL, then slug.</p></section>
      <div class="method-grid"><div><section class="panel"><h2>How implied value is built</h2><code class="formula-code">implied USD = max(1, round(TVL × category multiple × momentum × seasoning × reach))</code><ol>
        <li><b>Category multiple:</b> (n × TVL-weighted category median + 8 × TVL-weighted global median) / (n + 8), n = peer count, not TVL. Tokenized means either gecko_id or symbol is recorded. Only finite, strictly positive reported market caps and positive TVL enter the medians. Variant ${escape(calibration.variant)} (${escape(calibration.variant_label.toLowerCase())}) retains A's unweighted nearest-rank p25/p75 clip bounds, ${multiple(calibration.clip_low, 4)} to ${multiple(calibration.clip_high, 4)}. A category with no usable ratios uses the TVL-weighted global median.</li>
        <li><b>Momentum:</b> clamp(1 + change_7d / 100, 0.7, 1.5). Unreported seven-day change counts as 0. Growth is TVL change, not price performance.</li>
        <li><b>Seasoning:</b> 0.8 + 0.4 × min(age_days / 720, 1). Age is the day difference between listed_at and the latest listed_at in the snapshot (${escape(calibration.latest_listed_at ?? 'none')}); missing listing dates use age 0.</li>
        <li><b>Reach:</b> min(1 + 0.02 × (number of chains − 1), 1.10). Chain count is the snapshot array's length, not a claim about users.</li>
        <li><b>Ranking:</b> whole-dollar implied value descending, then TVL descending, then slug ascending. Ranks stay 1..N. S covers the top 10; A ranks 11–40; B the rest. These are value tiers, not launch signals.</li>
      </ol></section><section class="panel"><h2>What is included — and what is not known</h2><p>All ${data.watchlist_size} watchlist protocols are retained. Additional candidates record no token, pass observable category and name exclusions, and may sit below the ${money(data.floor_usd)} floor. This run ranks ${rows.length}, including ${data.early_size} below the floor.</p><p class="caution">Exclude Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking, Restaked BTC and CEX; wrapped/staked/staking products; version-suffixed names; and exchange-prefixed names. If candidates exceed 240, keep every watchlist row and fill by implied value.</p></section><section class="panel"><h2>Farm plans are playbooks, not snapshot facts</h2><p>Each protocol gets 4–8 conditional steps naming that protocol and a chain from its record. Product-type playbooks cover vault deposits, LP positions, supply/borrow, restaking, bridge-and-use and other category actions. Four-plus chains add a bridge step; seven-day change ≥15% adds crowding or ≤−15% adds outflow investigation first; age ≥365 days adds TGE-near review or <90 days adds early-multiplier review. Every plan ends with eligibility snapshot and claim-procedure verification, without asserting a program exists. Large TVL (≥$1B) budgets $250 with a dilution warning; $100M–$1B $100; below that $50 with smaller tickets acceptable.</p><p class="caution">Gas is an authored per-chain assumption, not a snapshot field. Ethereum $8–$35; Arbitrum, Base, Optimism, zkSync, Linea, Scroll, Blast and Mantle $0.10–$0.80; BSC $0.20–$1.00; Polygon $0.01–$0.10; Solana, Sui and Aptos $0.01–$0.05; Tron $0.50–$2.00; other chains $0.50–$5.00. Every step uses its protocol's primary-chain range.</p><p class="caution">TVL is not revenue. Peer ratios have selection bias and sparse coverage. Tracking age is not operating age. No launch date, points eligibility or return is known. “No token recorded” is a data classification, not proof that a token does not exist.</p></section></div>
      <aside><section class="panel"><h2>Calibration inputs</h2><div class="peer-stats"><div><strong>${multiple(calibration.global_median, 6)}</strong><small>Global clipped TVL-weighted median mcap / TVL</small></div><div><strong>${calibration.global_n}</strong><small>Usable positive ratios</small></div></div><dl class="brief-list"><div><dt>Winsor clip floor</dt><dd>${multiple(calibration.clip_low, 6)}</dd></div><div><dt>Winsor clip ceiling</dt><dd>${multiple(calibration.clip_high, 6)}</dd></div><div><dt>Snapshot protocols scanned</dt><dd>${data.protocols_scanned}</dd></div><div><dt>Token-recorded protocols excluded</dt><dd>${data.tokenized_count}</dd></div></dl><p class="caution">The whole table is computed at runtime from snapshot records, never a hardcoded multiple table.</p></section><section class="panel"><h2>Board category multiples</h2><div class="table-wrap"><table class="calibration-table" aria-label="Runtime category calibration"><thead><tr><th>Category</th><th class="num">n</th><th class="num">TVL-weighted median</th><th class="num">Shrunk</th></tr></thead><tbody>${boardCategories.map((group) => `<tr><td>${escape(group.category ?? 'Uncategorized')}</td><td class="num">${group.n}</td><td class="num">${group.median === null ? '—' : multiple(group.median, 3)}</td><td class="num positive">${multiple(group.multiple, 3)}</td></tr>`).join('')}</tbody></table></div></section></aside></div>`;
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
