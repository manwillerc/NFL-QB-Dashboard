/* API-derived data; all chart selections and controls live in shared state. */
'use strict';
const API = 'http://127.0.0.1:8000/api';
const number = new Intl.NumberFormat('en-US');
const metricNames = {passing_yards: 'Passing yards', passing_tds: 'Passing touchdowns', passing_interceptions: 'Interceptions thrown'};
let summary, weeklyRows;
const state = {playerId: null, team: null, metric: 'passing_yards', order: 'desc'};

function teamRows() {
  return weeklyRows.filter(row => !state.team || row.team === state.team);
}
function eligibleQbs() {
  if (!state.team) return summary.qbs;
  const grouped = d3.group(teamRows(), row => row.player_id);
  return Array.from(grouped, ([player_id, rows]) => ({
    player_id, player_display_name: rows[0].player_display_name,
    teams: [state.team], games: new Set(rows.map(row => row.game_id)).size,
    ...Object.fromEntries(Object.keys(metricNames).map(metric => [metric, d3.sum(rows, row => row[metric])])),
  }));
}
function updateState(change) {
  Object.assign(state, change);
  if (!summary.teams.some(row => row.team === state.team)) state.team = null;
  if (!eligibleQbs().some(row => row.player_id === state.playerId)) state.playerId = null;
  render();
}
function selectMark(selection, select, selected) {
  selection.attr('role', 'button').attr('aria-pressed', selected)
    .classed('selected', selected)
    .on('click', (event, datum) => { event.stopPropagation(); select(datum); })
    .on('keydown', (event, datum) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopPropagation(); select(datum);
      }
    });
}
function emptyChart(id, message) {
  const host = d3.select(id);
  host.selectAll('*').remove();
  host.append('p').attr('class', 'empty-chart').attr('role', 'status').text(message);
}
function renderControls() {
  document.querySelector('#ranking-metric').value = state.metric;
  document.querySelector('#ranking-order').value = state.order;
  const players = [...eligibleQbs()].sort((a, b) => a.player_display_name.localeCompare(b.player_display_name));
  const options = [{player_id: '', player_display_name: 'Select a quarterback', teams: []}, ...players];
  d3.select('#weekly-player').selectAll('option').data(options, d => d.player_id).join('option')
    .attr('value', d => d.player_id).text(d => `${d.player_display_name}${d.teams.length ? ' · ' + d.teams.join(' / ') : ''}`);
  document.querySelector('#weekly-player').value = state.playerId || '';
  const player = summary.qbs.find(row => row.player_id === state.playerId);
  document.querySelector('#qb-selection').textContent = `QB: ${player ? player.player_display_name : 'None selected'}`;
  document.querySelector('#team-selection').textContent = `Team: ${state.team || 'All teams'}`;
  document.querySelector('#clear-qb').disabled = !state.playerId;
  document.querySelector('#clear-team').disabled = !state.team;
  document.querySelector('#weekly-title').textContent = player ? `${player.player_display_name} · weekly trend` : 'Weekly passing trend';
}
const tooltip = document.querySelector('#tooltip');

function tipText(selection, describe) {
  selection.attr('tabindex', 0).attr('aria-label', describe)
    .on('pointerenter focus', function(event, datum) {
      tooltip.textContent = describe(datum);
      tooltip.hidden = false;
      placeTip(event, this);
    })
    .on('pointermove', function(event) { placeTip(event, this); })
    .on('click.tooltip', function(event, datum) {
      if (!this.isConnected) return;
      tooltip.textContent = describe(datum); tooltip.hidden = false; placeTip(event, this);
    })
    .on('pointerleave blur', () => { tooltip.hidden = true; });
  selection.append('title').text(describe);
}
function placeTip(event, element) {
  const rect = element.getBoundingClientRect();
  const left = event.clientX || rect.left + rect.width / 2;
  const top = event.clientY || rect.top;
  tooltip.style.left = `${Math.max(8, Math.min(left + 12, innerWidth - tooltip.offsetWidth - 12))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(top + 14, innerHeight - tooltip.offsetHeight - 12))}px`;
}
function canvas(id, height, margin, description) {
  const host = document.querySelector(id);
  host.querySelectorAll('.empty-chart').forEach(message => message.remove());
  const width = Math.max(host.clientWidth, 220);
  const svg = d3.select(host).selectAll('svg').data([null]).join('svg')
    .attr('viewBox', `0 0 ${width} ${height}`).attr('role', 'group').attr('aria-label', description);
  svg.selectAll('*').remove();
  svg.append('title').text(description);
  return {svg, width, height, margin, innerWidth: width - margin.left - margin.right, innerHeight: height - margin.top - margin.bottom,
    g: svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`)};
}
function axes(c, x, y, xLabel, yLabel, xAxis, yAxis) {
  c.g.append('g').attr('transform', `translate(0,${c.innerHeight})`).call(xAxis || d3.axisBottom(x).ticks(c.innerWidth < 300 ? 3 : 5).tickFormat(d3.format(',~g')));
  c.g.append('g').call(yAxis || d3.axisLeft(y).tickValues(y.ticks(5).filter(Number.isInteger)).tickSize(-c.innerWidth).tickFormat(d3.format(',d')));
  c.svg.append('text').attr('class', 'axis-label').attr('x', c.margin.left + c.innerWidth / 2).attr('y', c.height - 9).attr('text-anchor', 'middle').text(xLabel);
  c.svg.append('text').attr('class', 'axis-label').attr('transform', `translate(15,${c.margin.top + c.innerHeight / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(yLabel);
}
function renderRankings() {
  const metric = state.metric;
  const ascending = state.order === 'asc';
  const rows = [...eligibleQbs()].sort((a, b) => (ascending ? a[metric] - b[metric] : b[metric] - a[metric]) || a.player_display_name.localeCompare(b.player_display_name));
  document.querySelector('#ranking-caption').textContent = `${rows.length} quarterbacks · regular-season totals · ${ascending ? 'lowest' : 'highest'} first. ${metric === 'passing_interceptions' ? 'Fewer interceptions is generally preferable; these are counts, not interception rates.' : 'Longer bars show greater production; totals also reflect playing time.'} ${state.team ? `Totals include only games played for ${state.team}. ` : ''}Select a bar or player name to show the weekly trend. Scroll to see every player.`;
  if (!rows.length) { d3.select('#ranking-axis').selectAll('*').remove(); emptyChart('#rankings', 'No quarterbacks match this team. Clear the team filter to continue.'); return; }
  const c = canvas('#rankings', rows.length * 30 + 48, {top: 6, right: 52, bottom: 42, left: 140}, `Quarterback season rankings by ${metricNames[metric]}`);
  const low = Math.min(0, d3.min(rows, d => d[metric]) || 0);
  const x = d3.scaleLinear().domain([low, Math.max(1, d3.max(rows, d => d[metric]) || 0)]).nice().range([0, c.innerWidth]);
  const y = d3.scaleBand().domain(rows.map(d => d.player_id)).range([0, c.innerHeight]).padding(0.25);
  const tickCount = c.innerWidth < 240 ? 2 : 5;
  c.g.append('g').call(d3.axisTop(x).ticks(tickCount).tickSize(-c.innerHeight).tickFormat(() => '')).call(g => g.select('.domain').remove());
  const scale = canvas('#ranking-axis', 58, {top: 40, right: c.margin.right, bottom: 0, left: c.margin.left}, metricNames[metric]);
  scale.g.call(d3.axisTop(x).tickValues(c.innerWidth < 120 ? x.domain() : x.ticks(tickCount)).tickSize(0).tickFormat(d3.format(',~g'))).call(g => g.select('.domain').remove());
  scale.svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 16).text(`${metricNames[metric]} · season total`);
  scale.svg.append('text').attr('class', 'axis-label').attr('x', 0).attr('y', 43).text('Quarterback');
  const names = new Map(rows.map(d => [d.player_id, d.player_display_name]));
  const nameTicks = c.g.append('g').call(d3.axisLeft(y).tickFormat(id => names.get(id)).tickSize(0));
  nameTicks.select('.domain').remove();
  nameTicks.selectAll('.tick text').style('cursor', 'pointer').on('click', (event, id) => updateState({playerId: id}));
  const bars = c.g.selectAll('rect').data(rows).join('rect').attr('class', 'mark qb-bar').attr('x', d => x(Math.min(0, d[metric]))).attr('y', d => y(d.player_id)).attr('width', d => Math.max(3, Math.abs(x(d[metric]) - x(0)))).attr('height', y.bandwidth());
  bars.attr('data-player-id', d => d.player_id);
  selectMark(bars, d => updateState({playerId: d.player_id}), d => d.player_id === state.playerId);
  tipText(bars, d => `${d.player_display_name} · ${d.teams.join(' / ')}\n${metricNames[metric]}: ${number.format(d[metric])}\nRecorded appearances: ${d.games}`);
  c.g.selectAll('.bar-label').data(rows).join('text').attr('class', 'bar-label').attr('x', d => x(d[metric]) + 6).attr('y', d => y(d.player_id) + y.bandwidth() / 2).attr('dy', '.35em').text(d => number.format(d[metric]));
  c.svg.append('text').attr('class', 'axis-label').attr('x', c.margin.left + c.innerWidth / 2).attr('y', c.height - 9).attr('text-anchor', 'middle').text(`${metricNames[metric]} (season total)`);

}
function renderWeekly() {
  const playerId = state.playerId;
  if (!playerId) { emptyChart('#weekly', 'Select a QB in the rankings or dropdown to see the weekly trend.'); return; }
  const player = summary.qbs.find(d => d.player_id === playerId);
  const records = teamRows().filter(d => d.player_id === playerId);
  if (!records.length) { emptyChart('#weekly', 'No records match this selection.'); return; }
  const byWeek = new Map(records.map(d => [d.week, d]));
  const weeks = summary.metadata.weeks.map(week => ({week, record: byWeek.get(week)}));
  const c = canvas('#weekly', 350, {top: 20, right: 20, bottom: 52, left: 60}, `${player.player_display_name}: weekly passing yards`);
  const x = d3.scaleLinear().domain([1, 18]).range([0, c.innerWidth]);
  const y = d3.scaleLinear().domain([Math.min(0, d3.min(records, d => d.passing_yards) || 0), Math.max(1, d3.max(records, d => d.passing_yards) || 0)]).nice().range([c.innerHeight, 0]);
  axes(c, x, y, 'Regular-season week', 'Passing yards', d3.axisBottom(x).tickValues([1, 3, 6, 9, 12, 15, 18]).tickFormat(d3.format('d')));
  c.g.append('path').datum(weeks).attr('class', 'trend-line').attr('d', d3.line().defined(d => Boolean(d.record)).x(d => x(d.week)).y(d => y(d.record.passing_yards)));
  const dots = c.g.selectAll('circle').data(records).join('circle').attr('class', 'mark weekly-dot').attr('cx', d => x(d.week)).attr('cy', d => y(d.passing_yards)).attr('r', 4.5);
  tipText(dots, d => `${player.player_display_name} · Week ${d.week}\n${d.team} vs ${d.opponent_team}\nPassing yards: ${number.format(d.passing_yards)}\nTDs: ${d.passing_tds} · Interceptions: ${d.passing_interceptions}`);
}
function renderTeams() {
  const rows = summary.teams;
  const c = canvas('#teams', 350, {top: 25, right: 30, bottom: 52, left: 60}, 'Team QB passing yards versus passing touchdowns');
  const x = d3.scaleLinear().domain([0, d3.max(rows, d => d.passing_yards) * 1.08]).nice().range([0, c.innerWidth]);
  const y = d3.scaleLinear().domain([0, d3.max(rows, d => d.passing_tds) * 1.15]).nice().range([c.innerHeight, 0]);
  axes(c, x, y, 'QB passing yards', 'QB passing TDs');
  // Partition overlapping circles so a neighboring mark cannot cover a team's center.
  const cells = d3.Delaunay.from(rows, d => x(d.passing_yards), d => y(d.passing_tds))
    .voronoi([0, 0, c.innerWidth, c.innerHeight]);
  c.g.append('defs').selectAll('clipPath').data(rows).join('clipPath')
    .attr('id', d => `team-cell-${d.team}`).append('path').attr('d', (d, i) => cells.renderCell(i));
  const dots = c.g.selectAll('circle').data(rows).join('circle').attr('clip-path', d => `url(#team-cell-${d.team})`).attr('class', 'mark team-dot').attr('cx', d => x(d.passing_yards)).attr('cy', d => y(d.passing_tds)).attr('r', 6);
  dots.attr('data-team', d => d.team).classed('dimmed', d => Boolean(state.team) && d.team !== state.team);
  selectMark(dots, d => updateState({team: d.team}), d => d.team === state.team);
  tipText(dots, d => `${d.team} · QB passing production\nPassing yards: ${number.format(d.passing_yards)}\nPassing TDs: ${d.passing_tds}\nInterceptions: ${d.passing_interceptions}`);
  // Move labels only; points stay at the exact data coordinates.
  const labels = rows.map(d => ({...d, anchorX: x(d.passing_yards), anchorY: y(d.passing_tds),
    x: x(d.passing_yards) + 12, y: y(d.passing_tds) - 12}));
  const simulation = d3.forceSimulation(labels).force('x', d3.forceX(d => d.anchorX + 12).strength(0.25))
    .force('y', d3.forceY(d => d.anchorY - 12).strength(0.25))
    .force('collision', d3.forceCollide(16)).stop();
  for (let i = 0; i < 180; i++) simulation.tick();
  for (const label of labels) {
    label.x = Math.max(16, Math.min(c.innerWidth - 16, label.x));
    label.y = Math.max(9, Math.min(c.innerHeight - 9, label.y));
  }
  c.g.selectAll('.label-leader').data(labels).join('line').attr('class', 'label-leader')
    .attr('x1', d => d.anchorX).attr('y1', d => d.anchorY).attr('x2', d => d.x).attr('y2', d => d.y);
  c.g.selectAll('.team-label').data(labels).join('text').attr('class', 'team-label')
    .classed('selected-team-label', d => d.team === state.team)
    .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
    .attr('x', d => d.x).attr('y', d => d.y).attr('pointer-events', 'none').text(d => d.team);
  // Keep selection visible even where labels or neighboring points are dense.
  c.g.selectAll('.team-selection-ring').data(rows.filter(d => d.team === state.team)).join('circle')
    .attr('class', 'team-selection-ring').attr('cx', d => x(d.passing_yards))
    .attr('cy', d => y(d.passing_tds)).attr('r', 10).attr('fill', 'none')
    .attr('stroke', '#bd6530').attr('stroke-width', 3).attr('pointer-events', 'none');
}
function render() {
  const active = document.activeElement;
  const focusSelector = active?.dataset.playerId ? `.qb-bar[data-player-id="${CSS.escape(active.dataset.playerId)}"]`
    : active?.dataset.team ? `.team-dot[data-team="${CSS.escape(active.dataset.team)}"]` : null;
  tooltip.hidden = true;
  renderControls(); renderRankings(); renderWeekly(); renderTeams();
  if (focusSelector) document.querySelector(focusSelector)?.focus({preventScroll: true});
}
function showStatus(title, message, retry = false) {
  document.querySelector('#status').hidden = false;
  document.querySelector('#status').classList.toggle('error', retry);
  document.querySelector('#status-title').textContent = title;
  document.querySelector('#status-message').textContent = message;
  document.querySelector('#retry-load').hidden = !retry;
  document.querySelector('#dashboard').hidden = true;
}
async function load() {
  const status = document.querySelector('#status');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  document.querySelector('#main-content').setAttribute('aria-busy', 'true');
  showStatus('Loading quarterback data…', 'Preparing regular-season rankings, weekly records, and team totals.');
  try {
    const responses = await Promise.all([fetch(`${API}/summary`, {signal: controller.signal}), fetch(`${API}/qbs`, {signal: controller.signal})]);
    if (responses.some(response => !response.ok)) throw new Error('API request failed');
    const [totals, weekly] = await Promise.all(responses.map(response => response.json()));
    if (!Array.isArray(totals.qbs) || !Array.isArray(totals.teams) || !Array.isArray(weekly.rows)) throw new Error('Invalid API response');
    if (!totals.qbs.length || !totals.teams.length || !weekly.rows.length) {
      showStatus('No regular-season QB data available', 'Check the dataset used by the Flask API, then try again.', true);
      return;
    }
    summary = totals; weeklyRows = weekly.rows;
    document.querySelector('#player-count').textContent = number.format(summary.qbs.length);
    document.querySelector('#team-count').textContent = number.format(summary.teams.length);
    document.querySelector('#yards-total').textContent = number.format(d3.sum(summary.qbs, d => d.passing_yards));
    state.playerId = [...summary.qbs].sort((a, b) => b.passing_yards - a.passing_yards)[0].player_id;
    document.querySelector('#dashboard').hidden = false;
    status.hidden = true;
    render();
  } catch (error) {
    showStatus(error.name === 'AbortError' ? 'The data request timed out' : 'Couldn’t load quarterback data',
      'Check that the Flask API is running on port 8000, then try again.', true);
  } finally {
    clearTimeout(timeout);
    document.querySelector('#main-content').setAttribute('aria-busy', 'false');
  }
}
document.querySelector('#retry-load').addEventListener('click', load);
document.addEventListener('keydown', event => { if (event.key === 'Escape') tooltip.hidden = true; });
window.addEventListener('scroll', () => {
  const active = document.activeElement;
  if (active?.matches('.mark') && !tooltip.hidden) placeTip({}, active);
  else tooltip.hidden = true;
}, true);
document.querySelector('#ranking-metric').addEventListener('change', event => updateState({metric: event.target.value}));
document.querySelector('#ranking-order').addEventListener('change', event => updateState({order: event.target.value}));
document.querySelector('#weekly-player').addEventListener('change', event => updateState({playerId: event.target.value || null}));
document.querySelector('#clear-qb').addEventListener('click', () => updateState({playerId: null}));
document.querySelector('#clear-team').addEventListener('click', () => updateState({team: null}));
document.querySelector('#reset-all').addEventListener('click', () => updateState({team: null,
  playerId: [...summary.qbs].sort((a, b) => b.passing_yards - a.passing_yards)[0].player_id,
  metric: 'passing_yards', order: 'desc'}));
let resizeTimer;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (summary) render(); }, 120); });
load();
