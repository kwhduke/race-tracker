document.addEventListener('DOMContentLoaded', () => {
  const raceSelect = document.getElementById('race');
  const ageInput = document.getElementById('age');
  const paceInput = document.getElementById('pace');
  const ageNumber = document.getElementById('ageNumber');

  raceSelect.addEventListener('change', () => {
  if (typeof updateToggleAvailability === 'function') updateToggleAvailability();
});


  // --- AGE SYNC FIX (two-way binding + safe auto-update) ---
  ageInput.addEventListener('input', e => {
    const val = e.target.value;
    ageNumber.value = val;
  });

  ageNumber.addEventListener('input', e => {
    const val = e.target.value;
    if (!isNaN(val)) ageInput.value = val;
  });

  // Optional: auto-refresh chart/results if already shown
  [ageInput, ageNumber].forEach(el => {
    el.addEventListener('change', () => {
      if (!results.classList.contains('hidden')) {
        renderResultsAndChart();
      }
    });
  });
  const paceText = document.getElementById('paceText');
  const calcBtn = document.getElementById('calculate');
  const summaryText = document.getElementById('summaryText');
  const results = document.getElementById('results');
  const toggles = document.querySelectorAll('.toggle');

  let raceData = [];
  let overallChart = null;
  let fullDataLoaded = false; // becomes true when the full CSV has finished parsing
  let previewLoaded = false;  // true when we have a quick sample to populate the dropdown
  const _RACE_NAMES_KEY = 'raceNames_v1';


  // highlight drawing is handled per-chart in renderDistributionChart to avoid double draw


  // ---------- Utility Functions ----------
  function toSeconds(hms) {
    if (!hms || !hms.includes(':')) return null;
    const parts = hms.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return null;
  }

  function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h > 0 ? h + 'h ' : ''}${m}m`;
}

  function mean(arr) {
    const vals = arr.filter(x => !isNaN(x));
    return vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  }

  function median(arr) {
    const s = arr.filter(x => !isNaN(x)).sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // ✅ Use your real S3 file with CORS enabled
async function loadRaceData() {
  return new Promise((resolve, reject) => {
    const CSV_URL = "https://raw.githubusercontent.com/kwhduke/race-tracker/refs/heads/main/2024_half_results.csv";

  console.log(`🚀 FinishLine: Starting Papa.parse fetch for URL: ${CSV_URL}`);
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        try {
          const totalRows = Array.isArray(res.data) ? res.data.length : 0;
          const rows = res.data.filter(r => r.event_name && r["Chip Time"]);
          console.log(`🚀 FinishLine: Papa.parse complete — raw rows=${totalRows}, filtered rows=${rows.length}`);
          console.log('🚀 FinishLine: Preview rows:', rows.slice(0, 3));
          if (!rows.length) console.warn('🚀 FinishLine: Warning — no rows found after filtering CSV');
          console.log('🚀 FinishLine: Populating race dropdown...');
          populateRaceDropdown(rows);
          console.log('🚀 FinishLine: Race dropdown populated');
          raceData = rows;
          resolve(rows);
        } catch (err) {
          console.error('🚀 FinishLine: Error processing Papa.parse result', err && err.stack ? err.stack : err);
          reject(err);
        }
      },
      error: (err) => {
        console.error('🚀 FinishLine: Papa.parse failed', err && err.stack ? err.stack : err);
        reject(err);
      }
    });
  });
}


  function populateRaceDropdown(rows) {
  console.log(`🚀 FinishLine: populateRaceDropdown start — total rows=${rows.length}`);
  const unique = [...new Set(rows.map(r => (r.event_name || '').trim()))].filter(Boolean);
  raceSelect.innerHTML = unique.map(r => `<option value="${r}">${r}</option>`).join('');
    console.log(`🚀 FinishLine: populateRaceDropdown complete — unique races=${unique.length}`);
    // persist quick list for next-visit instant population (non-sensitive small cache)
    try { localStorage.setItem(_RACE_NAMES_KEY, JSON.stringify(unique)); } catch (e) {}
  }

    // Quick preview loader: fetch header + sample of rows so UX can populate instantly
    function loadRacePreview() {
      return new Promise((resolve, reject) => {
        const CSV_URL = "https://raw.githubusercontent.com/kwhduke/race-tracker/refs/heads/main/2024_half_results.csv";
        console.log('✅ FinishLine: starting race preview (Papa.parse preview:200)');
        Papa.parse(CSV_URL, {
          download: true,
          header: true,
          skipEmptyLines: true,
          preview: 200,
          complete: (res) => {
            try {
              const rows = Array.isArray(res.data) ? res.data.filter(r => r.event_name) : [];
              console.log('✅ FinishLine: race preview ready — preview rows=', Math.min(rows.length, 200));
              if (rows.length) populateRaceDropdown(rows);
              previewLoaded = true;
              raceData = rows;
              resolve(rows);
            } catch (err) { console.error('✅ FinishLine: race preview error', err); reject(err); }
          },
          error: (err) => { console.error('✅ FinishLine: race preview failed', err); reject(err); }
        });
      });
    }

  // ---------- Event Handlers ----------
  // --- Distance Toggle Logic ---
const distanceToggles = document.querySelectorAll('#distanceToggle .toggle-distance');
let selectedDistance = 'Marathon';

distanceToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.classList.contains('disabled')) return;
    distanceToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDistance = btn.dataset.value;
    results.classList.add('hidden');
  });
});


  // --- Gender Toggle Logic ---
const genderToggles = document.querySelectorAll('#genderToggle .toggle');
let selectedGender = 'Male'; // default

genderToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    genderToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedGender = btn.dataset.value;
  });
});

  function updateToggleAvailability() {
  const selectedRace = raceSelect.value;
  if (!selectedRace || !raceData.length) return;

  const thisRaceRows = raceData.filter(
    r => (r.event_name || '').toLowerCase() === selectedRace.toLowerCase()
  );
  const hasHalf = thisRaceRows.some(r => (r.event_type || '').toLowerCase().includes('half'));
  const hasFull = thisRaceRows.some(r => (r.event_type || '').toLowerCase().includes('full'));

  const halfBtn = document.querySelector('#distanceToggle .toggle-distance[data-value="Half Marathon"]');
  const fullBtn = document.querySelector('#distanceToggle .toggle-distance[data-value="Marathon"]');

  // Reset both buttons first
  [halfBtn, fullBtn].forEach(btn => {
    if (!btn) return;
    btn.classList.remove('disabled', 'active');
  });

  // Always prefer Marathon by default
  selectedDistance = 'Marathon';

  // Disable Half if missing data
  if (!hasHalf && halfBtn) halfBtn.classList.add('disabled');

  // Activate Marathon by default if it exists
  if (fullBtn) fullBtn.classList.add('active');

  // If Marathon data doesn’t exist but Half does, fallback
  if (!hasFull && hasHalf) {
    if (fullBtn) fullBtn.classList.add('disabled');
    if (halfBtn) {
      halfBtn.classList.remove('disabled');
      halfBtn.classList.add('active');
      selectedDistance = 'Half Marathon';
    }
  }
}

  // keep slider and text synced
  paceInput.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    const mins = Math.floor(val);
    const secs = Math.round((val - mins) * 60).toString().padStart(2, '0');
    if (paceText) paceText.value = `${mins}:${secs}`;
  });

  paceText.addEventListener('change', e => {
    if (!paceText) return;
    const parts = paceText.value.split(':').map(Number);
    const m = parts[0] || 0;
    const s = parts[1] || 0;
    if (!isNaN(m) && !isNaN(s)) paceInput.value = (m + s / 60).toFixed(2);
  });

  calcBtn.addEventListener('click', () => {
    // If the full dataset hasn't finished loading yet, show a small non-blocking note
    if (!fullDataLoaded) {
      showTransientNote(calcBtn, '⏳ Loading full results… please wait a moment.', 4000);
      return;
    }
    renderResultsAndChart();
    // re-anchor highlight band to newly calculated finishTime
    try {
      const selectedType = selectedDistance;
      const distance = selectedType === 'Marathon' ? 26.2 : 13.1;
      const finishTime = (parseFloat(paceInput.value) || 0) * distance * 60; // seconds
      window._hzUserMin = finishTime;
      if (overallChart && overallChart.options && overallChart.options.highlightBand) {
        overallChart.options.highlightBand.baseTime = finishTime;
        overallChart.options.highlightBand.compareTime = null;
        overallChart.update('none');
      }
    } catch (e) { /* ignore */ }
  });

  // ---------- Core Logic ----------
  function renderResultsAndChart() {
    const raceName = raceSelect.value;
    const selectedType = selectedDistance;
    const gender = selectedGender;
    const age = parseInt(ageInput.value);
    const pace = parseFloat(paceInput.value);
    const distance = selectedType === 'Marathon' ? 26.2 : 13.1;
    const finishTime = pace * distance * 60; // convert to seconds

    // Filter dataset to correct race + type
    const filtered = raceData.filter(
      d => d.event_name === raceName && d.event_type === selectedType
    );

    if (!filtered.length) {
      summaryText.innerHTML = `⚠️ No data found for ${selectedType}`;
      return;
    }

    // Convert all chip times
    const chipTimes = filtered.map(r => toSeconds(r['Chip Time'])).filter(Boolean).sort((a, b) => a - b);
    const total = chipTimes.length;

  // Compute placement by counting strictly faster runners to avoid edge cases at extremes
  const fasterCount = chipTimes.filter(t => t < finishTime).length;
  const overallPlace = fasterCount + 1;
  const percentileNum = chipTimes.length ? ((chipTimes.length - overallPlace) / chipTimes.length) * 100 : 0;
  const invertedNum = 100 - percentileNum;
  const percentile = percentileNum.toFixed(1);
  const invertedPercentile = invertedNum.toFixed(1);

    // Gender placement: prefer 'Place Gender' (e.g. "1 M" or "2 F") if present, otherwise fall back to 'Gender'
    const userGender = gender && typeof gender === 'string' ? gender.charAt(0).toUpperCase() : '';
    const genderFiltered = filtered.filter(r => {
      const pg = r['Place Gender'] || r['Gender'] || '';
      return extractGender(pg) === userGender;
    });
    const genderTimes = genderFiltered.map(r => toSeconds(r['Chip Time'])).filter(Boolean).sort((a, b) => a - b);
    const gIdx = genderTimes.findIndex(t => t >= finishTime);
    const genderPlace = gIdx === -1 ? genderTimes.length : gIdx + 1;
    const genderTotal = genderTimes.length;
  // Compute gender Top% consistent with overall placement logic
  const genderPercentile = genderTotal > 0 ? ((genderTotal - genderPlace) / genderTotal * 100).toFixed(1) : '0.0';
  const genderTop = genderTotal > 0 ? (100 - parseFloat(genderPercentile)).toFixed(1) : '100.0';

    // Division placement (use Gender initial + Age columns directly)
    const userAgeRange = findClosestAgeRange(age);
    const userGenderInitial = (gender || '').charAt(0).toUpperCase(); // 'M' or 'F'
    const division = `${userGenderInitial}${userAgeRange}`;

    const divisionData = filtered.filter(d => {
      const dGender = (d['Gender'] || '').toString().trim().toUpperCase(); // 'M'/'F'
      const dAge = (d['Age'] || '').toString().trim(); // e.g. '30-34'
      return dGender === userGenderInitial && dAge === userAgeRange;
    });

    const divTimes = divisionData
      .map(r => toSeconds(r['Chip Time']))
      .filter(Boolean)
      .sort((a, b) => a - b);

    const divisionPlace = divTimes.length ? (divTimes.filter(t => t < finishTime).length + 1) : 'N/A';
    const divTotal = divTimes.length;
    const divisionPercentile = divTotal ? ((divTotal - (divisionPlace || divTotal)) / divTotal * 100).toFixed(1) : 'N/A';
    const divisionTop = divTotal ? (100 - parseFloat(divisionPercentile)).toFixed(1) : 'N/A';

    // Summary (avoid repeating the distance if it's already in the race name;
    // render as a single paragraph)
    const esc = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    let displayTitle = raceName || selectedType;
    try {
      const rn = (raceName || '').toString().trim();
      const st = (selectedType || '').toString().trim();
      if (rn && st) {
        // if raceName already contains the distance text (case-insensitive), don't append it
        if (rn.toLowerCase().includes(st.toLowerCase())) displayTitle = rn;
        else displayTitle = `${rn} ${st}`;
      } else if (rn) displayTitle = rn;
      else displayTitle = st;
    } catch (e) { displayTitle = raceName || selectedType; }

    summaryText.innerHTML = `<p>Your estimated completion time for the <strong>${esc(displayTitle)}</strong> is <strong>${esc(formatTime(finishTime))}</strong>. Based on last year's results, you'd finish around <strong>#${esc(overallPlace)} out of ${esc(total)}</strong> (<strong>top ${esc(invertedPercentile)}%</strong> overall).</p>`;

    // Placement cards
    document.getElementById('placementRow').innerHTML = `
      ${card('Overall Placement', `#${overallPlace}`, `out of ${total}<br><span class="placement-percentage">Top ${invertedPercentile}%</span>`)}
  ${card('Gender Placement', `#${genderPlace}`, `out of ${genderTotal}<br><span class="placement-percentage">Top ${genderTop}%</span>`)}
      ${card('Division Placement', `#${divisionPlace}`, `${division}<br><span class="placement-percentage">Top ${divisionTop}%</span>`)}
    `;

    // Demographic & performance cards
    const ages = filtered.map(d => { const a = parseInt(d.Age); return isNaN(a) ? null : a; }).filter(Boolean);
    const avgAge = mean(ages);
    const medAge = median(ages);
    // compute mode (most frequent age). returns smallest age in tie
    const ageCounts = ages.reduce((acc, a) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {});
    let modeAge = null;
    let modeCount = 0;
    Object.entries(ageCounts).forEach(([age, cnt]) => {
      const ai = parseInt(age);
      if (cnt > modeCount || (cnt === modeCount && (modeAge === null || ai < modeAge))) {
        modeAge = ai;
        modeCount = cnt;
      }
    });
  const genderCounts = countBy(filtered, 'Gender');
  const genderEntries = Object.entries(genderCounts).map(([k, v]) => ({ k, v, pct: (v / total) * 100 }));
  // sort by percentage descending
  genderEntries.sort((a, b) => b.pct - a.pct);
  const genderBreakdownItems = genderEntries.map(e => `${e.k}: ${e.v} (${e.pct.toFixed(1)}%)`);
    const chipAvg = mean(chipTimes);
    const chipMed = median(chipTimes);

    // Division breakdown: top 5 divisions by count
    const divisionCounts = {};
    filtered.forEach(d => {
      let dv = (d['Place Div'] || '').toString();
      // clean: remove leading place numbers, NBSPs, and trim
      dv = dv.replace(/^[0-9]+\s*/, '').replace(/\u00A0/g, '').trim();
      if (!dv) return;
      divisionCounts[dv] = (divisionCounts[dv] || 0) + 1;
    });
    const topDivisions = Object.entries(divisionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const divisionLines = topDivisions.length > 0
      ? topDivisions.map(([k, v]) => `${k}: ${v}`).join('\n')
      : 'No division data';

    // render as monospaced lines inside the card
    const divisionHtml = `<pre class="stat-list" style="text-align:center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace;">${divisionLines}</pre>`;

    const ageLines = `Average: ${Math.round(avgAge)}\nMedian: ${Math.round(medAge)}\nMode: ${modeAge !== null ? modeAge : '—'}`;
    const ageHtml = `<pre class="stat-list" style="text-align:center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace;">${ageLines}</pre>`;

    // Finish times: compute avg/median/mode for chip times (in seconds) and format as hours/min display
    const ftAvg = chipAvg; // already in seconds
    const ftMed = chipMed;
    // mode for finish times: find most frequent rounded-to-minute value to avoid near-unique times
    const rounded = chipTimes.map(t => Math.round(t / 60)); // minutes
    const roundCounts = {};
    rounded.forEach(m => { roundCounts[m] = (roundCounts[m] || 0) + 1; });
    const topRounded = Object.entries(roundCounts).sort((a,b)=>b[1]-a[1])[0];
  const ftModeMin = topRounded ? parseInt(topRounded[0],10) : null;
  const ftModeDisplay = ftModeMin !== null ? formatTime(ftModeMin * 60) : '—';
  const ftLines = `Average: ${formatTime(ftAvg)}\nMedian: ${formatTime(ftMed)}\nMode: ${ftModeDisplay}`;
    const ftHtml = `<pre class="stat-list" style="text-align:center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace;">${ftLines}</pre>`;

    document.getElementById('demographicsRow').innerHTML =
      `${card('Age', ageHtml, '')}
       ${card('Gender', renderList(genderBreakdownItems))}
       ${card('Division', divisionHtml)}`;

    // compute per-run pace values (seconds per mile)
    const perRunPaceSec = filtered.map(r => {
      const p = r['Pace (min/miles)'] || '';
      if (p && p.includes(':')) {
        const parts = p.split(':').map(Number);
        return (parts[0] * 60 + (parts[1] || 0)); // seconds per mile
      }
      // fallback: compute from chip time and distance
      const t = toSeconds(r['Chip Time']);
      if (!t) return null;
      return t / distance;
    }).filter(Boolean);

    const paceAvgSec = mean(perRunPaceSec);
    const paceMedSec = median(perRunPaceSec);
    // mode for pace: round to nearest 5s to reduce uniqueness
    const roundedPaces = perRunPaceSec.map(s => Math.round(s / 5) * 5);
    const paceCounts = {};
    roundedPaces.forEach(s => { paceCounts[s] = (paceCounts[s] || 0) + 1; });
    const topPace = Object.entries(paceCounts).sort((a,b)=>b[1]-a[1])[0];
    const paceModeSec = topPace ? parseInt(topPace[0],10) : null;

    const fmtPace = s => {
      if (!s && s !== 0) return '—';
      const m = Math.floor(s / 60);
      const sec = Math.round(s % 60).toString().padStart(2, '0');
      return `${m}:${sec} min/mi`;
    };

    const paceLines = `Average: ${fmtPace(paceAvgSec)}\nMedian: ${fmtPace(paceMedSec)}\nMode: ${paceModeSec !== null ? Math.floor(paceModeSec/60)+':' + (paceModeSec%60).toString().padStart(2,'0') + ' min/mi' : '—'}`;
    const paceHtml = `<pre class="stat-list" style="text-align:center; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, 'Roboto Mono', 'Segoe UI Mono', monospace;">${paceLines}</pre>`;

    document.getElementById('performanceRow').innerHTML =
      `${card('Finish Times', ftHtml, '')}
       ${card('Pace', paceHtml)}`;

    results.classList.remove('hidden');

    // Chart rendering (userTime in minutes)
    try {
      renderDistributionChart('overallChart', filtered, finishTime, 'All Runners');
    } catch (e) {
      console.error('Chart render failed', e);
    }
  }

  // ---------- Helpers ----------
  function countBy(arr, key) {
    return arr.reduce((acc, o) => {
      const v = o[key] || 'Unknown';
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {});
  }

  // Extract M/F from 'Place Gender' or 'Gender' values
  function extractGender(value) {
    if (!value) return '';
    const m = value.toString().match(/([MF])/i);
    return m ? m[1].toUpperCase() : '';
  }

  // Given numeric age, return the age-range string used in CSV, e.g. 27 -> '25-29'
  function findClosestAgeRange(ageNum) {
    if (!ageNum || isNaN(ageNum)) return '';
    const lower = Math.floor(ageNum / 5) * 5;
    const upper = lower + 4;
    return `${lower}-${upper}`;
  }

  function renderList(items) {
    return `<ul class="stat-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  }

  function card(title, stat, sub = '') {
    return `<div class="result-card"><h3>${title}</h3><p class="result-number">${stat}</p><p class="result-sub">${sub}</p></div>`;
  }

    // ---------- Chart Rendering ----------
function renderDistributionChart(canvasId, filtered, userTime, labelText) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  const overlay = document.getElementById('highlightOverlay');
  const hint = document.getElementById('dragHint') || document.querySelector('.drag-instruction');
  // --- Fade-in Drag Hint Near Highlight Zone ---
  // --- Drag Hint Logic (auto-hide after real interaction) ---
  const dragHint = document.getElementById('dragHint');

  // Show hint initially on every load
  if (dragHint) {
    dragHint.style.opacity = 1;
    dragHint.style.animationPlayState = 'running';
  }

  // Hide permanently when user has clearly interacted (hover, tooltip, or tap)
  // Session-only dismissal: hide the hint for this page session
  let hintHiddenThisSession = false;
  function hideDragHint() {
    if (!dragHint || hintHiddenThisSession) return;
    dragHint.classList.add('dragHint-hide');
    dragHint.style.animationPlayState = 'paused';
    dragHint.style.opacity = 0; // ensure it disappears fully
    hintHiddenThisSession = true;
    setTimeout(() => (dragHint.style.display = 'none'), 800);
    // Accessibility: announce that the hint was dismissed so screen readers update
    try {
      const ann = document.getElementById('announcer');
      if (ann) ann.textContent = 'Drag hint dismissed';
    } catch (e) {}
  }

  // Previously we hid the hint on any pointermove/click or tooltip activation.
  // Instead, we'll only hide the hint when the user actually begins dragging (movement beyond a small threshold).
  overlay.style.display = 'block';
  overlay.style.background = 'transparent';
  // Ensure internal units are seconds
  const chipTimes = filtered.map(r => toSeconds(r['Chip Time'])).filter(Boolean).sort((a,b)=>a-b);

  // --- Chart range optimization (visual only) ---
  const bins = 80;

  // sort to determine percentile cutoffs
  const sortedTimes = [...chipTimes].sort((a, b) => a - b);
  const minT = sortedTimes[Math.floor(sortedTimes.length * 0.00)]; // fastest finisher
  const maxT = sortedTimes[Math.floor(sortedTimes.length * 0.98)]; // ignore slowest 2%

  // compute bins only within this range (no impact on stats)
  const step = (maxT - minT) / bins;
  const counts = Array(bins).fill(0);
  chipTimes.forEach(t => {
    if (t >= minT && t <= maxT) {
      counts[Math.min(bins - 1, Math.floor((t - minT) / step))]++;
    }
  });
  const labels = counts.map((_, i) => minT + i * step);

  // optional: slight padding so first/last bars aren’t flush
  const visualPadding = (maxT - minT) * 0.01;
  const chartMin = minT - visualPadding;
  const chartMax = maxT + visualPadding;

  if (overallChart) overallChart.destroy();

  // helper for time formatting
  const formatHMS = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ...existing code... (touch handlers moved below after overlay is declared)

  // Ensure highlight globals exist before creating chart
  if (window._hzEnabled === undefined) window._hzEnabled = true;
  window._hzUserMin = window._hzUserMin || userTime;

  // create a soft vertical gradient for the chart fill (darker blue tones)
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  gradient.addColorStop(0, 'rgba(30, 100, 255, 0.25)');
  gradient.addColorStop(1, 'rgba(30, 100, 255, 0.0)');

  overallChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: labelText,
        data: counts,
  borderColor: 'rgba(30, 100, 255, 0.95)',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.35,
        backgroundColor: gradient,
        fill: true
      }]
    },
    options: {
  maintainAspectRatio: false,
  aspectRatio: 2.0, // slightly wider chart without affecting responsiveness
      animation: false,
      plugins: {
        legend: { display: false, labels: { color: '#222' } },
        tooltip: {
          mode: 'index',
          intersect: false,
          titleColor: '#111',
          bodyColor: '#333',
          callbacks: {
            title: (tooltipItems) => `Time: ${formatHMS(+tooltipItems[0].label)}`,
            label: (ctx) => `${ctx.formattedValue} runners`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { color: 'rgba(0,0,0,0.1)' },
          title: { display: true, text: 'Finish Time' },
          min: chartMin,
          max: chartMax,
          ticks: {
            callback: (v) => {
              const h = Math.floor(v / 3600);
              const m = Math.floor((v % 3600) / 60);
              return `${h}:${m.toString().padStart(2,'0')}`;
            }
          }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.05)' },
          border: { color: 'rgba(0,0,0,0.1)' },
          title: { display: true, text: 'Number of Runners' }
        }
      },
      // expose baseTime to per-chart plugin
      highlightBand: {
        baseTime: userTime,
        compareTime: null
      }
    },
    plugins: [{
      id: 'highlightBand',
      afterDraw(chart) {
        const { ctx, chartArea, scales: { x } } = chart;
        if (!x || !chartArea) return;
        const { baseTime, compareTime } = chart.options.highlightBand || {};
        if (!baseTime) return;

        // compute band as small percent of range
        const range = x.max - x.min;
        const bandLow = baseTime - range * 0.015;
        const bandHigh = baseTime + range * 0.015;
        const xMin = x.getPixelForValue(bandLow);
        const xMax = x.getPixelForValue(bandHigh);

  // draw base band first (darker neutral gray)
  ctx.save();
  ctx.fillStyle = 'rgba(140,140,140,0.45)'; // darker neutral gray
  ctx.fillRect(xMin, chartArea.top, xMax - xMin, chartArea.bottom - chartArea.top);
  ctx.restore();

        // draw compare band on top if present (soft green)
        if (compareTime) {
          const compareLow = compareTime - range * 0.015;
          const compareHigh = compareTime + range * 0.015;
          const cMin = x.getPixelForValue(compareLow);
          const cMax = x.getPixelForValue(compareHigh);
          ctx.save();
          ctx.fillStyle = 'rgba(90,180,90,0.45)'; // slightly darker green
          ctx.fillRect(cMin, chartArea.top, cMax - cMin, chartArea.bottom - chartArea.top);
          // optional compare marker (subtle)
          const px = x.getPixelForValue(compareTime);
          // keep drawing call but make the inner marker visually transparent
          ctx.fillStyle = 'rgba(90,180,90,0)'; // fully transparent
          ctx.fillRect(px - 3, chartArea.top, 6, chartArea.bottom - chartArea.top);
          ctx.restore();
        }
      }
    }]
  });

  // overlay and hint variables were declared earlier; ensure display/background set
  overlay.style.display = 'block';
  // ensure overlay is transparent so band is visible
  overlay.style.background = 'transparent';
  let dragging = false;
  let startX = 0;
  let hintTimer = null;
  let startBaseTime = null; // anchor (seconds) for the current drag
  let hintPendingDrag = false; // true after mousedown/touchstart until movement exceeds threshold

  // Show initial animated cue on load (only if not dismissed)
  try { if (dragHint && !hintHiddenThisSession) { dragHint.style.animation = 'dragPulse 2.8s ease-in-out infinite'; } } catch (e) {}

  overlay.onmousedown = e => {
    dragging = true;
    startX = e.offsetX;
    // determine anchor: prefer existing compareTime so subsequent drags continue from last position
    try {
      const band = overallChart && overallChart.options && overallChart.options.highlightBand ? overallChart.options.highlightBand : null;
      if (band && typeof band.compareTime === 'number') startBaseTime = band.compareTime;
      else if (band && typeof band.baseTime === 'number') startBaseTime = band.baseTime;
      else startBaseTime = userTime;
    } catch (err) {
      startBaseTime = userTime;
    }
    // mark that a real drag may begin; we'll hide the hint only after movement exceeds a small threshold
    hintPendingDrag = true;
    clearTimeout(hintTimer);
  };
  overlay.onmousemove = e => {
  if (!dragging) return;
  // Prevent invalid touch data from triggering NaN calculations
  if (isNaN(e.offsetX) || e.offsetX === undefined) return;
    // If the hint is pending, only hide it once the user actually moves the pointer a few pixels
    if (hintPendingDrag) {
      const moved = Math.abs(e.offsetX - startX);
      if (moved > 4) {
        try { hideDragHint(); } catch (er) {}
        hintPendingDrag = false;
      }
    }
    const deltaX = e.offsetX - startX;
    const secondsPerPixel = overlay.offsetWidth > 0 ? (maxT - minT) / overlay.offsetWidth : 0;
    // compute compTime relative to startBaseTime so drags continue from last compare position
    const compTime = (typeof startBaseTime === 'number' ? startBaseTime : userTime) + deltaX * secondsPerPixel;
    if (overallChart && overallChart.options && overallChart.options.highlightBand) {
      overallChart.options.highlightBand.compareTime = compTime;
    }

  // determine base (anchored) time for percent calculations
  const base = (overallChart && overallChart.options && overallChart.options.highlightBand && overallChart.options.highlightBand.baseTime) || userTime;
  // percent delta vs base
  const pctDelta = (((compTime - base) / base) * 100).toFixed(1);
    const speedStr = pctDelta > 0 ? `+${pctDelta}% slower` : `${Math.abs(pctDelta)}% faster`;

    // pace (min:sec per mile)
    const selectedType = selectedDistance;
    const miles = selectedType === 'Marathon' ? 26.2 : 13.1;
    const paceSeconds = compTime / miles;
    const paceMin = Math.floor(paceSeconds / 60);
    const paceSec = Math.round(paceSeconds % 60).toString().padStart(2, '0');
    const newPace = `${paceMin}:${paceSec} min/mi`;

    // percentile (Top X%)
    const fasterCount = chipTimes.filter(t => t <= compTime).length;
    const percentile = chipTimes.length ? ((fasterCount / chipTimes.length) * 100).toFixed(1) : '0.0';
    const topStr = `Top ${percentile}%`;

    // create/update floating label
    let label = document.getElementById('dragLabel');
    const chartArea = overallChart.chartArea || {};
    const xScale = overallChart.scales && overallChart.scales.x;
    if (!label) {
      label = document.createElement('div');
      label.id = 'dragLabel';
      overlay.parentElement.appendChild(label);
    }

    label.textContent = `${speedStr} | ${newPace} | ${topStr}`;
    if (xScale) {
      const px = xScale.getPixelForValue(compTime);
      label.style.left = `${px}px`;
    }
    label.style.top = `${(chartArea.top || 0) - 28}px`;
    label.style.transform = 'translateX(-50%)';
  // ensure visible class triggers fade-in (do this before updating the chart)
  if (!label.classList.contains('visible')) requestAnimationFrame(() => label.classList.add('visible'));

  // do not aggressively hide the hint here; hiding is managed by hintPendingDrag logic above
  // final: update chart visuals without animation
  overallChart.update('none');
  };
  overlay.onmouseup = () => {
    dragging = false;
    // keep compareTime persistent; just re-render
    overallChart.update('none');
    // persist final compareTime as the new baseline and keep label visible
    try {
      const finalComp = overallChart && overallChart.options && overallChart.options.highlightBand ? overallChart.options.highlightBand.compareTime : null;
      if (typeof finalComp === 'number') {
        // persist for future drags and quick references
        overallChart.options.highlightBand.compareTime = finalComp;
        window._hzUserMin = finalComp;
        // update startBaseTime so next drag starts from here
        startBaseTime = finalComp;
      }
    } catch (err) { /* ignore */ }

    // Show cue again after 10s idle (only if not dismissed)
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      try { if (dragHint && !hintHiddenThisSession) dragHint.style.animation = 'dragPulse 2.8s ease-in-out infinite'; } catch (e) {}
    }, 10000);
  // clear pending hint state if mouse/touch ended without sufficient movement
  hintPendingDrag = false;
  };

  // Helper: compute "offsetX" from a clientX-like point relative to the overlay
  const offsetXFromClient = (clientX) => {
    const rect = overlay.getBoundingClientRect();
    return Math.max(0, Math.min(rect.width, (clientX - rect.left)));
  };

  // Synthetic event with full mouse-like shape for touch support
  const synth = (clientX) => ({
    offsetX: offsetXFromClient(clientX),
    clientX: clientX,
    layerX: offsetXFromClient(clientX)
  });

  // --- Fixed mobile touch drag (no NaN, preserves stickiness) ---
  const firstTouch = (e) => e.touches?.[0] || e.changedTouches?.[0];

  overlay.addEventListener('touchstart', e => {
    const t = firstTouch(e);
    if (!t) return;
    // ripple feedback (non-blocking)
    try {
      const r = document.createElement('div');
      r.className = 'drag-ripple';
      const rect = overlay.getBoundingClientRect();
      r.style.left = `${t.clientX - rect.left}px`;
      r.style.top = `${t.clientY - rect.top}px`;
      overlay.appendChild(r);
      setTimeout(() => r.remove(), 520);
    } catch (_) {}

    overlay.onmousedown(synth(t.clientX));
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    const t = firstTouch(e);
    if (!t) return;
    // while dragging we allow preventDefault to avoid page scroll
    e.preventDefault();
    overlay.onmousemove(synth(t.clientX));
  }, { passive: false });

  overlay.addEventListener('touchend', () => {
    overlay.onmouseup();
  }, { passive: true });

  // Make the drag hint interactive: forward pointer events from the hint to the overlay
  try {
    const hintEl = document.getElementById('dragHint');
    if (hintEl) {
      // pointerdown should start the same drag behavior
      hintEl.addEventListener('pointerdown', (ev) => {
        // synthesize a mousedown on the overlay at the same clientX
        ev.preventDefault();
        overlay.onmousedown(synth(ev.clientX));
        // capture subsequent pointer moves on document and forward them
        const onMove = (m) => overlay.onmousemove(synth(m.clientX));
        const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp); overlay.onmouseup(); };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      // Make hint cursor active on pointerenter to match overlay behavior
      hintEl.addEventListener('pointerenter', () => { hintEl.style.cursor = 'grab'; });
    }
  } catch (e) {}
}



  // transient note helper (shows a small message near a node for `ms` milliseconds)
  function showTransientNote(anchorEl, message, ms = 3000) {
    try {
      let note = document.getElementById('calcNote');
      if (!note) {
        note = document.createElement('div');
        note.id = 'calcNote';
        note.setAttribute('role', 'status');
        note.style.marginTop = '8px';
        note.style.fontSize = '0.92rem';
        note.style.color = '#444';
        anchorEl.parentElement.appendChild(note);
      }
      note.textContent = message;
      note.style.opacity = '1';
      clearTimeout(note._t);
      note._t = setTimeout(() => { try { note.style.opacity = '0'; note.remove(); } catch (e) {} }, ms);
    } catch (e) {}
  }

  (async function init() {
    console.log('🚀 FinishLine: init() called — loading preview first');
    // If we have a cached list of race names from a prior visit, populate immediately
    try {
      const cached = localStorage.getItem(_RACE_NAMES_KEY);
      if (cached) {
        const names = JSON.parse(cached || '[]');
        if (Array.isArray(names) && names.length) {
          raceSelect.innerHTML = names.map(r => `<option value="${r}">${r}</option>`).join('');
          console.log('✅ FinishLine: populated race dropdown from cached names');
        }
      }
    } catch (e) {}

    try {
      // Fast preview to show the dropdown quickly
      await loadRacePreview();

      // Start full data load in background (quiet, non-blocking)
      setTimeout(() => {
        loadRaceData().then(rows => {
          try {
            // if the full dataset contains new race names, re-populate the dropdown
            const previewNames = Array.from(new Set((Array.from(raceSelect.options) || []).map(o => o.value)));
            const fullNames = Array.from(new Set(rows.map(r => (r.event_name || '').trim()))).filter(Boolean);
            const newNames = fullNames.filter(n => !previewNames.includes(n));
            if (newNames.length) {
              // Merge and repopulate preserving order: full dataset preferred
              const merged = Array.from(new Set([...fullNames, ...previewNames]));
              raceSelect.innerHTML = merged.map(r => `<option value="${r}">${r}</option>`).join('');
              console.log('✅ FinishLine: dropdown updated with new race names from full dataset');
            }
            // replace preview data with full data set
            raceData = rows;
            fullDataLoaded = true;
            console.log('✅ FinishLine: full dataset loaded — rows=', raceData.length);
            try { if (typeof updateToggleAvailability === 'function') updateToggleAvailability(); } catch (e) {}
          } catch (err) { console.error('✅ FinishLine: post-full-load processing error', err); }
        }).catch(err => { console.error('✅ FinishLine: full dataset load failed', err); });
      }, 300);

    } catch (e) {
      console.error('❌ FinishLine: preview load failed', e);
      // Fallback: still attempt full load
      try {
        loadRaceData().then(rows => { raceData = rows; fullDataLoaded = true; try { if (typeof updateToggleAvailability === 'function') updateToggleAvailability(); } catch (e) {} });
      } catch (er) { console.error('Failed fallback full load', er); }
    }
  })();
});

// Ensure init is wired to DOMContentLoaded if a global init exists; otherwise note internal invocation
if (typeof init === 'function') {
  window.addEventListener('DOMContentLoaded', init);
  console.log('🚀 FinishLine: window.addEventListener("DOMContentLoaded", init) attached');
} else {
  console.log('🚀 FinishLine: init() is not a global function; initialized internally on DOMContentLoaded');
}