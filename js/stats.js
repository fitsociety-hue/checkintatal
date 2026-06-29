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

  const periodTypeSelect = document.getElementById('filter-period-type');
  const periodValueSelect = document.getElementById('filter-period-value');

  function updatePeriodValues() {
    const type = periodTypeSelect.value;
    periodValueSelect.innerHTML = '';
    if (type === 'month') {
      periodValueSelect.style.display = 'inline-block';
      periodValueSelect.innerHTML = '<option value="all">전체 월</option>';
      for(let m=1; m<=12; m++) {
        periodValueSelect.innerHTML += `<option value="${m}">${m}월</option>`;
      }
      periodValueSelect.value = new Date().getMonth() + 1;
    } else if (type === 'quarter') {
      periodValueSelect.style.display = 'inline-block';
      periodValueSelect.innerHTML = `
        <option value="1">1분기</option>
        <option value="2">2분기</option>
        <option value="3">3분기</option>
        <option value="4">4분기</option>
      `;
    } else if (type === 'half') {
      periodValueSelect.style.display = 'inline-block';
      periodValueSelect.innerHTML = `
        <option value="1">상반기</option>
        <option value="2">하반기</option>
      `;
    } else if (type === 'year') {
      periodValueSelect.style.display = 'none';
      periodValueSelect.innerHTML = '<option value="all">전체</option>';
    }
  }

  periodTypeSelect.addEventListener('change', updatePeriodValues);
  updatePeriodValues();

  document.getElementById('btn-load-stats').addEventListener('click', () => loadStats(true));
  document.getElementById('btn-export').addEventListener('click', exportToExcel);
  
  if (Auth.getUser().role === '관리자') {
    const saveBtn = document.getElementById('btn-save-sheets');
    saveBtn.classList.remove('hidden');
    saveBtn.addEventListener('click', saveToSpreadsheet);
  }

  loadStats(); // initial load
});

async function loadStats(forceRefresh = false) {
  const year = document.getElementById('filter-year').value;
  const periodType = document.getElementById('filter-period-type').value;
  const periodValue = document.getElementById('filter-period-value').value;
  const user = Auth.getUser();

  try {
    let action = 'getStats';
    const params = { year, periodType, periodValue };
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
    document.querySelector('#stats-table tbody').innerHTML = '<tr><td colspan="11" class="text-center">데이터를 불러오지 못했습니다.</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="11" class="text-center">조회된 실적이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = programs.map(p => {
    return `
      <tr>
        <td data-label="팀명">${p.팀명 || '-'}</td>
        <td data-label="사업명">${p.사업명 || '-'}</td>
        <td data-label="목표 실인원">${Utils.formatNumber(p.목표_실인원 || 0)}</td>
        <td data-label="목표 건수">${Utils.formatNumber(p.목표_건수 || 0)}</td>
        <td data-label="목표 연인원">${Utils.formatNumber(p.목표_연인원 || 0)}</td>
        <td data-label="실적 실인원" style="font-weight: 500;">${Utils.formatNumber(p.실인원 || 0)}</td>
        <td data-label="실적 건수" style="font-weight: 500;">${Utils.formatNumber(p.건수 || 0)}</td>
        <td data-label="실적 연인원" style="font-weight: 500;">${Utils.formatNumber(p.연인원 || 0)}</td>
        <td data-label="달성률(실인원)"><span style="color:${getColor(p.목표대비_실인원)}; font-weight: bold;">${p.목표대비_실인원 || 0}%</span></td>
        <td data-label="달성률(건수)"><span style="color:${getColor(p.목표대비_건수)}; font-weight: bold;">${p.목표대비_건수 || 0}%</span></td>
        <td data-label="달성률(연인원)"><span style="color:${getColor(p.목표대비_연인원)}; font-weight: bold;">${p.목표대비_연인원 || 0}%</span></td>
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
  
  // Create export format matching UI
  const exportData = currentStatsData.map(p => ({
    '팀명': p.팀명,
    '사업명': p.사업명,
    '목표_실인원': p.목표_실인원,
    '목표_건수': p.목표_건수,
    '목표_연인원': p.목표_연인원,
    '실적_실인원': p.실인원,
    '실적_건수': p.건수,
    '실적_연인원': p.연인원,
    '달성률_실인원(%)': p.목표대비_실인원,
    '달성률_건수(%)': p.목표대비_건수,
    '달성률_연인원(%)': p.목표대비_연인원
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "실적집계");
  
  const y = document.getElementById('filter-year').value;
  const t = document.getElementById('filter-period-type').value;
  const v = document.getElementById('filter-period-value').value;
  const filename = `실적집계_${y}년_${t}_${v}.xlsx`;
  
  XLSX.writeFile(wb, filename);
}

async function saveToSpreadsheet() {
  if (!currentStatsData || currentStatsData.length === 0) {
    Utils.showToast('저장할 실적 데이터가 없습니다. 먼저 조회해주세요.', 'warning');
    return;
  }
  if (!confirm('현재 화면에 조회된 실적 데이터를 구글 스프레드시트(실적_마스터 시트)에 저장하시겠습니까?\\n(해당 기간의 기존 데이터는 덮어쓰기 됩니다.)')) return;

  const btn = document.getElementById('btn-save-sheets');
  const originalText = btn.textContent;
  btn.textContent = '저장 중...';
  btn.disabled = true;

  try {
    const year = document.getElementById('filter-year').value;
    const periodType = document.getElementById('filter-period-type').value;
    const periodValue = document.getElementById('filter-period-value').value;

    const res = await API.fetchGAS('saveStatsMaster', {
      year, periodType, periodValue, statsData: currentStatsData
    });
    
    if (res.success) {
      Utils.showToast('스프레드시트에 성공적으로 저장되었습니다.', 'success');
    } else {
      Utils.showToast(res.message || '저장에 실패했습니다.', 'error');
    }
  } catch (error) {
    Utils.showToast('서버 오류가 발생했습니다.', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
