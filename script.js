document.addEventListener('DOMContentLoaded', () => {
  const raceSelect = document.getElementById('race');
  const ageInput = document.getElementById('age');
  const paceInput = document.getElementById('pace');
  const ageNumber = document.getElementById('ageNumber');
  const paceText = document.getElementById('paceText');
  const calcBtn = document.getElementById('calculate');
  const summaryText = document.getElementById('summaryText');
  const results = document.getElementById('results');
  const toggles = document.querySelectorAll('.toggle');

  let raceData = [];
  let overallChart = null;


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

  // ---------- Load and Populate ----------
  async function loadRaceData() {
    return new Promise((resolve, reject) => {
      Papa.parse('data/2024_half_results.csv', {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const rows = res.data.filter(r => r.event_name && r['Chip Time']);
          populateRaceDropdown(rows);
          resolve(rows);
        },
        error: reject
      });
    });
  }

  function populateRaceDropdown(rows) {
    const unique = [...new Set(rows.map(r => (r.event_name || '').trim()))].filter(Boolean);
    raceSelect.innerHTML = unique.map(r => `<option value="${r}">${r}</option>`).join('');
  }

  // ---------- Event Handlers ----------
  toggles.forEach(t => {
    t.addEventListener('click', () => {
      toggles.forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      results.classList.add('hidden');
    });
  });

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
    if (!raceData.length) return alert('Data not yet loaded.');
    renderResultsAndChart();
    // re-anchor highlight band to newly calculated finishTime
    try {
      const selectedType = document.querySelector('.toggle.active')?.dataset?.value || 'Half Marathon';
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
    const selectedType = document.querySelector('.toggle.active')?.dataset?.value || 'Half Marathon';
    const gender = document.querySelector('input[name="gender"]:checked').value;
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

    // Find nearest placement
    const idx = chipTimes.findIndex(t => t >= finishTime);
    const overallPlace = idx === -1 ? total : idx + 1;
    const percentile = ((total - overallPlace) / total * 100).toFixed(1);
    const invertedPercentile = (100 - percentile).toFixed(1);

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

    // Division placement (e.g. M30-34)
    const division = `${gender.charAt(0)}${Math.floor(age / 5) * 5}-${Math.floor(age / 5) * 5 + 4}`;
    const divisionData = filtered.filter(d => {
      const pd = d['Place Div'] || '';
      const match = pd.match(/([MF][0-9]{2}-[0-9]{2})/);
      return match ? match[1] === division : false;
    });
    const divTimes = divisionData.map(r => toSeconds(r['Chip Time'])).filter(Boolean).sort((a, b) => a - b);
    const dIdx = divTimes.findIndex(t => t >= finishTime);
    const divisionPlace = dIdx === -1 ? divTimes.length : dIdx + 1;
    const divTotal = divTimes.length;
  const divisionPercentile = divTotal > 0 ? ((divTotal - divisionPlace) / divTotal * 100).toFixed(1) : '0.0';
  const divisionTop = divTotal > 0 ? (100 - parseFloat(divisionPercentile)).toFixed(1) : '100.0';

    // Summary
    summaryText.innerHTML = `
      Your estimated completion time for the <strong>${selectedType}</strong> is
      <strong>${formatTime(finishTime)}</strong>.<br>
      Based on last year's results, you'd finish around
      <strong>#${overallPlace} out of ${total}</strong> (<strong>top ${invertedPercentile}%</strong> overall).
    `;

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
    const ftLines = `Average: ${formatTime(ftAvg)}\nMedian: ${formatTime(ftMed)}\nMode: ${ftModeMin !== null ? ftModeMin + 'm' : '—'}`;
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
       ${card('Pace', paceHtml, `${selectedType} (${distance} mi)`)}`;

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

  function renderList(items) {
    return `<ul class="stat-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  }

  function card(title, stat, sub = '') {
    return `<div class="result-card"><h3>${title}</h3><p class="result-number">${stat}</p><p class="result-sub">${sub}</p></div>`;
  }

    // ---------- Chart Rendering ----------
function renderDistributionChart(canvasId, filtered, userTime, labelText) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  // Ensure internal units are seconds
  const chipTimes = filtered.map(r => toSeconds(r['Chip Time'])).filter(Boolean).sort((a,b)=>a-b);

  const bins = 80;
  const minT = Math.min(...chipTimes);
  const maxT = Math.max(...chipTimes);
  const step = (maxT - minT) / bins;
  const counts = Array(bins).fill(0);
  chipTimes.forEach(t => counts[Math.min(bins - 1, Math.floor((t - minT) / step))]++);
  const labels = counts.map((_, i) => minT + i * step);

  if (overallChart) overallChart.destroy();

  // helper for time formatting
  const formatHMS = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Ensure highlight globals exist before creating chart
  if (window._hzEnabled === undefined) window._hzEnabled = true;
  window._hzUserMin = window._hzUserMin || userTime;

  overallChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: labelText,
        data: counts,
        borderColor: '#111',
        borderWidth: 1.6,
        pointRadius: 0,
        tension: 0.25
      }]
    },
    options: {
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (tooltipItems) => `Time: ${formatHMS(+tooltipItems[0].label)}`,
            label: (ctx) => `${ctx.formattedValue} runners`
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Finish Time (hours:minutes)' },
          ticks: {
            callback: (v) => {
              const h = Math.floor(v / 3600);
              const m = Math.floor((v % 3600) / 60);
              return `${h}:${m.toString().padStart(2,'0')}`;
            }
          }
        },
        y: {
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

        // draw base band first (neutral gray)
        ctx.save();
        ctx.fillStyle = 'rgba(180,180,180,0.35)'; // light neutral gray
        ctx.fillRect(xMin, chartArea.top, xMax - xMin, chartArea.bottom - chartArea.top);
        ctx.restore();

        // draw compare band on top if present (soft green)
        if (compareTime) {
          const compareLow = compareTime - range * 0.015;
          const compareHigh = compareTime + range * 0.015;
          const cMin = x.getPixelForValue(compareLow);
          const cMax = x.getPixelForValue(compareHigh);
          ctx.save();
          ctx.fillStyle = 'rgba(120,200,120,0.35)'; // light faded green
          ctx.fillRect(cMin, chartArea.top, cMax - cMin, chartArea.bottom - chartArea.top);
          // optional compare marker (subtle)
          const px = x.getPixelForValue(compareTime);
          // keep drawing call but make the inner marker visually transparent
          ctx.fillStyle = 'rgba(120,200,120,0)'; // fully transparent
          ctx.fillRect(px - 3, chartArea.top, 6, chartArea.bottom - chartArea.top);
          ctx.restore();
        }
      }
    }]
  });

  const overlay = document.getElementById('highlightOverlay');
  const hint = document.getElementById('dragHint') || document.querySelector('.drag-instruction');
  overlay.style.display = 'block';
  // ensure overlay is transparent so band is visible
  overlay.style.background = 'transparent';
  let dragging = false;
  let startX = 0;
  let hintTimer = null;
  let startBaseTime = null; // anchor (seconds) for the current drag

  // Show initial animated cue on load
  try { if (hint) { hint.style.animation = 'fadeInOut 3s ease-in-out forwards'; } } catch (e) {}

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
    // hide hint during drag
    try { if (hint) hint.style.opacity = 0; } catch (e) {}
    clearTimeout(hintTimer);
  };
  overlay.onmousemove = e => {
    if (!dragging) return;
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
    const selectedType = document.querySelector('.toggle.active')?.dataset?.value || 'Half Marathon';
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

  try { if (hint) hint.style.opacity = 0; } catch (e) {}
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

    // Show cue again after 10s idle
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      try { if (hint) hint.style.animation = 'fadeInOut 3s ease-in-out forwards'; } catch (e) {}
    }, 10000);
  };
}



  (async function init() {
    try {
      raceData = await loadRaceData();
      console.log('✅ Loaded', raceData.length, 'rows');
    } catch (e) {
      console.error('❌ Failed to load CSV', e);
    }
  })();
});
