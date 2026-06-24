// js/stats.js

let currentStatsData = [];

document.addEventListener('DOMContentLoaded', () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  // Populate Year filter
  const currentYear = new Date().getFullYear();
  const yearSelect = document.getElementById('filter-year');
  for (let y = currentYear - 1; y <= currentYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y + '년';
    if (y === currentYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  const currentMonth = new Date().getMonth() + 1;
  document.getElementById('filter-month').value = currentMonth;

  document.getElementById('btn-load-stats').addEventListener('click', () => loadStats(true));
  document.getElementById('btn-export').addEventListener('click', exportToExcel);
  
  loadStats(); // initial load
});

async function loadStats(forceRefresh = false) {
  const year = document.getElementById('filter-year').value;
  const month = document.getElementById('filter-month').value;
  const user = Auth.getUser();

  try {
    let action = 'getStats';
    const params = { year, month };
    if (forceRefresh) params.forceRefresh = true;
    
    if (user.role === '관리자') {
      action = 'getAllStats';
    } else if (user.role === '팀장') {
      params.teamName = user.team;
    } else {
      action = 'getPersonalStats';
      params.staffId = user.staffId;
    }
    
    const res = await API.fetchGAS(action, params);
    
    // Using dummy structure matching requested layout if real backend varies
    currentStatsData = res.data.programs || []; 
    
    renderSummary(res.data);
    renderTable(currentStatsData);
    if (user.role === '관리자') {
      document.getElementById('chart-container').classList.remove('hidden');
      renderChart(res.data.teamStats || []);
    } else {
      document.getElementById('chart-container').classList.add('hidden');
    }
  } catch(e) {
    document.querySelector('#stats-table tbody').innerHTML = '<tr><td colspan="8" class="text-center">데이터를 불러오지 못했습니다.</td></tr>';
  }
}

function renderSummary(data) {
  const summaryDiv = document.getElementById('stats-summary');
  summaryDiv.innerHTML = `
    <div class="glass-card stat-card">
      <h3>전체 실인원</h3>
      <div class="value">${Utils.formatNumber(data.totalRealCount || 0)}명</div>
    </div>
    <div class="glass-card stat-card">
      <h3>전체 건수</h3>
      <div class="value">${Utils.formatNumber(data.totalItemCount || 0)}건</div>
    </div>
    <div class="glass-card stat-card">
      <h3>전체 연인원</h3>
      <div class="value">${Utils.formatNumber(data.totalAccumCount || 0)}명</div>
    </div>
    <div class="glass-card stat-card">
      <h3>평균 달성률</h3>
      <div class="value">${data.avgAchieveRate || 0}%</div>
    </div>
  `;
}

function renderTable(programs) {
  const tbody = document.querySelector('#stats-table tbody');
  if (!programs || programs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">조회된 실적이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = programs.map(p => {
    return `
      <tr>
        <td>${p.팀명 || '-'}</td>
        <td>${p.사업명 || '-'}</td>
        <td>${Utils.formatNumber(p.실인원 || 0)}</td>
        <td>${Utils.formatNumber(p.건수 || 0)}</td>
        <td>${Utils.formatNumber(p.연인원 || 0)}</td>
        <td><span style="color:${getColor(p.목표대비_실인원)}">${p.목표대비_실인원 || 0}%</span></td>
        <td><span style="color:${getColor(p.목표대비_건수)}">${p.목표대비_건수 || 0}%</span></td>
        <td><span style="color:${getColor(p.목표대비_연인원)}">${p.목표대비_연인원 || 0}%</span></td>
      </tr>
    `;
  }).join('');
}

function getColor(rate) {
  if (!rate) return 'var(--color-text)';
  if (rate >= 100) return 'var(--color-success)';
  if (rate >= 80) return 'var(--color-warning)';
  return 'var(--color-error)';
}

let chartInstance = null;
function renderChart(teamStats) {
  const ctx = document.getElementById('stats-chart');
  if (chartInstance) chartInstance.destroy();
  
  if (!teamStats || teamStats.length === 0) return;

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: teamStats.map(t => t.team),
      datasets: [{
        label: '달성률 (%)',
        data: teamStats.map(t => t.rate),
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true, max: 100 } }
    }
  });
}

function exportToExcel() {
  if (!currentStatsData || currentStatsData.length === 0) {
    Utils.showToast('내보낼 데이터가 없습니다.', 'warning');
    return;
  }
  
  const ws = XLSX.utils.json_to_sheet(currentStatsData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "실적집계");
  
  const y = document.getElementById('filter-year').value;
  const m = document.getElementById('filter-month').value;
  const filename = `실적집계_${y}년${m !== 'all' ? '_' + m + '월' : ''}.xlsx`;
  
  XLSX.writeFile(wb, filename);
}
