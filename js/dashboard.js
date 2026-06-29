// js/dashboard.js

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  const user = Auth.getUser();
  const container = document.getElementById('dashboard-content');
  
  window.refreshDashboard = function(forceRefresh = false) {
    if (user.role === '관리자') {
      renderAdminDashboard(container, forceRefresh);
    } else if (user.role === '팀장') {
      renderLeaderDashboard(container, user.team, forceRefresh);
    } else {
      renderStaffDashboard(container, user, forceRefresh);
    }
  };
  
  window.refreshDashboard();
});

async function renderAdminDashboard(container, forceRefresh = false) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h2 style="margin:0;">관리자 대시보드</h2>
      <button class="btn-secondary" onclick="window.refreshDashboard(true)" style="padding: 6px 12px; font-size: 0.9em;">새로고침</button>
    </div>
    <div class="grid-cards mb-3" id="admin-summary">
      <div class="glass-card stat-card"><div class="spinner"></div></div>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">관리자 설정</h3>
      <div class="flex gap-2 items-center mt-2">
        <input type="password" id="new-admin-pw" class="form-input" placeholder="새 관리자 비밀번호" style="max-width:200px;">
        <button class="btn-primary" onclick="changeAdminPassword()">비밀번호 변경</button>
      </div>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">팀별 달성률 (평균)</h3>
      <canvas id="admin-chart"></canvas>
    </div>
  `;
  
  try {
    const res = await API.fetchGAS('getAllStats', forceRefresh ? { forceRefresh: true } : {});
    const stats = res.data; // assume it returns aggregated stats
    
    const summaryHtml = `
      <div class="glass-card stat-card">
        <h3>전체 실인원 합계</h3>
        <div class="value">${Utils.formatNumber(stats.totalRealCount)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>전체 연인원 합계</h3>
        <div class="value">${Utils.formatNumber(stats.totalAccumCount)}명</div>
      </div>
      <div class="glass-card stat-card">
        <h3>전체 건수 합계</h3>
        <div class="value">${Utils.formatNumber(stats.totalItemCount)}건</div>
      </div>
      <div class="glass-card stat-card">
        <h3>전체 달성률 (평균)</h3>
        <div class="value">${stats.avgAchieveRate || 0}%</div>
      </div>
    `;
    document.getElementById('admin-summary').innerHTML = summaryHtml;
    
    // Chart
    if (stats.teamStats && stats.teamStats.length > 0) {
      const ctx = document.getElementById('admin-chart').getContext('2d');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: stats.teamStats.map(t => t.team),
          datasets: [{
            label: '팀별 평균 달성률 (%)',
            data: stats.teamStats.map(t => t.rate),
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
  } catch (e) {
    document.getElementById('admin-summary').innerHTML = '<p>데이터를 불러오지 못했습니다.</p>';
  }
}

window.currentLeaderStats = null;

async function renderLeaderDashboard(container, teamName, forceRefresh = false) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  
  let yearOptions = '';
  for(let y=currentYear-1; y<=currentYear+1; y++) {
    yearOptions += `<option value="${y}" ${y===currentYear?'selected':''}>${y}년</option>`;
  }
  
  let monthOptions = '';
  for(let m=1; m<=12; m++) {
    monthOptions += `<option value="${m}" ${m===currentMonth?'selected':''}>${m}월</option>`;
  }

  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h2 style="margin:0;">${teamName} 대시보드</h2>
      <button class="btn-secondary" onclick="window.refreshDashboard(true)" style="padding: 6px 12px; font-size: 0.9em;">새로고침</button>
    </div>
    <div class="grid-cards mb-3" id="leader-summary">
      <div class="glass-card stat-card"><div class="spinner"></div></div>
    </div>
    
    <!-- 조회 기간 및 상세 실적 표 영역 -->
    <div class="glass-card mb-3">
      <div class="flex justify-between items-center mb-2">
        <h3 style="margin:0;">사업별 상세 실적</h3>
        <div class="flex gap-2 items-center">
          <select id="report-year" class="form-select" style="max-width: 100px;">${yearOptions}</select>
          <select id="report-month" class="form-select" style="max-width: 100px;">${monthOptions}</select>
        </div>
      </div>
      <div class="table-container">
        <table class="table-glass" id="leader-stats-table">
          <thead>
            <tr>
              <th rowspan="2">팀명</th>
              <th rowspan="2">사업명</th>
              <th colspan="3">목표 실적</th>
              <th colspan="3">기간 실적</th>
              <th colspan="3">목표 달성률</th>
            </tr>
            <tr>
              <th>실인원</th>
              <th>건수</th>
              <th>연인원</th>
              <th>실인원</th>
              <th>건수</th>
              <th>연인원</th>
              <th>실인원</th>
              <th>건수</th>
              <th>연인원</th>
            </tr>
          </thead>
          <tbody>
            <tr><td colspan="11" class="text-center">데이터를 불러오는 중입니다...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 월별 실적 보고서 작성 영역 -->
    <div class="glass-card mb-3">
      <h3 class="mb-3">월별 실적 보고서 작성</h3>
      <div class="grid-cards" style="grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">실적 총평</label>
          <textarea id="report-performance" class="form-input" rows="4" placeholder="해당 월의 전반적인 실적 평가를 작성하세요."></textarea>
        </div>
        <div>
          <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">예산 (세입/세출)</label>
          <textarea id="report-budget" class="form-input" rows="4" placeholder="예산 집행 내역 및 특이사항을 작성하세요."></textarea>
        </div>
        <div>
          <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">성과 (특이사항)</label>
          <textarea id="report-achievements" class="form-input" rows="4" placeholder="주요 성과 및 특이사항을 작성하세요."></textarea>
        </div>
        <div>
          <label class="form-label" style="font-weight: bold; margin-bottom: 4px; display: block;">향후 계획</label>
          <textarea id="report-plans" class="form-input" rows="4" placeholder="다음 달 주요 계획을 작성하세요."></textarea>
        </div>
      </div>
      <div class="mt-3" style="text-align: right;">
        <button class="btn-success" onclick="downloadLeaderReport('${teamName}')">엑셀 보고서 다운로드</button>
      </div>
    </div>
  `;

  document.getElementById('report-year').addEventListener('change', () => updateLeaderReportStats(teamName));
  document.getElementById('report-month').addEventListener('change', () => updateLeaderReportStats(teamName));

  updateLeaderReportStats(teamName, forceRefresh);
}

window.updateLeaderReportStats = async function(teamName, forceRefresh = false) {
  const summaryDiv = document.getElementById('leader-summary');
  const tbody = document.querySelector('#leader-stats-table tbody');
  
  if (summaryDiv) summaryDiv.innerHTML = '<div class="glass-card stat-card"><div class="spinner"></div></div>';
  if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center">데이터를 불러오는 중입니다...</td></tr>';
  
  try {
    const year = document.getElementById('report-year').value;
    const month = document.getElementById('report-month').value;
    const params = { teamName, year, periodType: 'month', periodValue: month };
    if (forceRefresh) params.forceRefresh = true;

    const res = await API.fetchGAS('getStats', params);
    const stats = res.data;
    window.currentLeaderStats = stats;

    let targetReal = 0, actualReal = 0;
    let targetCount = 0, actualCount = 0;
    let targetAccum = 0, actualAccum = 0;
    
    if (stats && stats.programs) {
      stats.programs.forEach(p => {
        targetReal += p.목표_실인원 || 0;
        actualReal += p.실인원 || 0;
        targetCount += p.목표_건수 || 0;
        actualCount += p.건수 || 0;
        targetAccum += p.목표_연인원 || 0;
        actualAccum += p.연인원 || 0;
      });
    }

    const rateReal = targetReal > 0 ? Math.round((actualReal / targetReal) * 100) : 0;
    const rateCount = targetCount > 0 ? Math.round((actualCount / targetCount) * 100) : 0;
    const rateAccum = targetAccum > 0 ? Math.round((actualAccum / targetAccum) * 100) : 0;
    const avgRate = Math.round((rateReal + rateCount + rateAccum) / 3) || 0;

    if (summaryDiv) {
      summaryDiv.innerHTML = `
        <div class="glass-card stat-card">
          <h3>팀 실인원</h3>
          <div class="value">${Utils.formatNumber(actualReal)}명</div>
        </div>
        <div class="glass-card stat-card">
          <h3>팀 건수</h3>
          <div class="value">${Utils.formatNumber(actualCount)}건</div>
        </div>
        <div class="glass-card stat-card">
          <h3>팀 연인원</h3>
          <div class="value">${Utils.formatNumber(actualAccum)}명</div>
        </div>
        <div class="glass-card stat-card">
          <h3>팀 달성률 (평균)</h3>
          <div class="value">${avgRate}%</div>
          <div class="progress-container"><div class="progress-bar" style="width: ${Math.min(avgRate, 100)}%"></div></div>
        </div>
      `;
    }

    if (tbody) {
      if (!stats || !stats.programs || stats.programs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center">조회된 실적이 없습니다.</td></tr>';
      } else {
        const getColor = (rate) => rate >= 100 ? 'var(--success)' : rate >= 80 ? 'var(--primary)' : rate >= 50 ? 'var(--warning)' : 'var(--danger)';
        tbody.innerHTML = stats.programs.map(p => `
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
        `).join('');
      }
    }
  } catch(e) {
    if (summaryDiv) summaryDiv.innerHTML = '<p>데이터를 불러오지 못했습니다.</p>';
    if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="text-center">데이터를 불러오지 못했습니다.</td></tr>';
  }
}

async function renderStaffDashboard(container, user, forceRefresh = false) {
  container.innerHTML = `
    <div class="flex justify-between items-center mb-3">
      <h2 style="margin:0;">환영합니다, ${user.name}님!</h2>
      <button class="btn-secondary" onclick="window.refreshDashboard(true)" style="padding: 6px 12px; font-size: 0.9em;">새로고침</button>
    </div>
    <div class="glass-card mb-3">
      <h3 class="mb-2">내 담당 사업 (빠른 이동)</h3>
      <div class="grid-cards" id="staff-programs">
        <p>담당 사업을 불러오는 중...</p>
      </div>
    </div>
  `;
  try {
    const params = { staffId: user.staffId };
    if (forceRefresh) params.forceRefresh = true;
    const res = await API.fetchGAS('getPersonalStats', params);
    const programs = res.data.programs || [];
    const progsDiv = document.getElementById('staff-programs');
    if (programs.length === 0) {
      progsDiv.innerHTML = '<p>담당 사업이 없습니다.</p>';
    } else {
      progsDiv.innerHTML = programs.map(p => `
        <div class="glass-card flex justify-between items-center" style="padding: 16px; cursor: pointer; margin-bottom: 8px;" onclick="window.location.href='attendance.html?programName=${encodeURIComponent(p.사업명)}'">
          <div style="flex: 1;">
            <div class="badge badge-primary mb-1">${p.subCategory || p.parentName || p.실적유형}</div>
            <h4 style="margin:0">${p.사업명}</h4>
          </div>
          <div style="margin-right: 16px; text-align: right;">
            <span class="text-muted" style="font-size: 0.9em;">달성율</span>
            <div style="font-size: 1.2em; font-weight: bold; color: var(--primary);">${p.mainRate || 0}%</div>
          </div>
          <button class="btn-secondary">출석체크</button>
        </div>
      `).join('');
    }
  } catch(e) {}
}

window.changeAdminPassword = async function() {
  const newPw = document.getElementById('new-admin-pw').value;
  if (!newPw) {
    Utils.showToast('새 비밀번호를 입력하세요.', 'error');
    return;
  }
  try {
    await API.fetchGAS('updateAdminPassword', { newPassword: newPw });
    Utils.showToast('관리자 비밀번호가 변경되었습니다.', 'success');
    document.getElementById('new-admin-pw').value = '';
  } catch(e) {
    Utils.showToast('비밀번호 변경에 실패했습니다.', 'error');
  }
}

window.downloadLeaderReport = async function(teamName) {
  const btn = event.currentTarget;
  const originalText = btn.textContent;
  btn.textContent = '생성 중...';
  btn.disabled = true;

  try {
    const year = document.getElementById('report-year').value;
    const month = document.getElementById('report-month').value;
    
    const stats = window.currentLeaderStats;
    
    if (!stats || !stats.programs || stats.programs.length === 0) {
      Utils.showToast('해당 월의 실적 데이터가 없습니다.', 'warning');
      return;
    }

    let targetReal = 0, actualReal = 0;
    let targetCount = 0, actualCount = 0;
    let targetAccum = 0, actualAccum = 0;
    
    stats.programs.forEach(p => {
      targetReal += p.목표_실인원 || 0;
      actualReal += p.실인원 || 0;
      targetCount += p.목표_건수 || 0;
      actualCount += p.건수 || 0;
      targetAccum += p.목표_연인원 || 0;
      actualAccum += p.연인원 || 0;
    });

    const rateReal = targetReal > 0 ? Math.round((actualReal / targetReal) * 100) : 0;
    const rateCount = targetCount > 0 ? Math.round((actualCount / targetCount) * 100) : 0;
    const rateAccum = targetAccum > 0 ? Math.round((actualAccum / targetAccum) * 100) : 0;

    const tPerf = document.getElementById('report-performance').value || '';
    const tBudget = document.getElementById('report-budget').value || '';
    const tAchieve = document.getElementById('report-achievements').value || '';
    const tPlans = document.getElementById('report-plans').value || '';

    const wb = XLSX.utils.book_new();

    const titleRow = [`${teamName} ${year}년 ${month}월 실적 보고서`];
    const subtitleRow = ['■ 팀 실적 보고'];
    
    const header1 = ['팀명', '사업명', '목표 실적', null, null, '기간 실적', null, null, '목표 달성률', null, null];
    const header2 = [null, null, '실인원', '건수', '연인원', '실인원', '건수', '연인원', '실인원', '건수', '연인원'];

    const totalAvgRateReal = targetReal > 0 ? Math.round((actualReal / targetReal) * 100) : 0;
    const totalAvgRateCount = targetCount > 0 ? Math.round((actualCount / targetCount) * 100) : 0;
    const totalAvgRateAccum = targetAccum > 0 ? Math.round((actualAccum / targetAccum) * 100) : 0;
    
    const totalRow = [
      '합계', null, 
      targetReal, targetCount, targetAccum,
      actualReal, actualCount, actualAccum,
      `${totalAvgRateReal}%`, `${totalAvgRateCount}%`, `${totalAvgRateAccum}%`
    ];

    const aoa = [
      titleRow,
      subtitleRow,
      [], 
      header1,
      header2,
      totalRow
    ];

    stats.programs.forEach(p => {
      aoa.push([
        p.팀명 || '',
        p.사업명 || '',
        p.목표_실인원 || 0,
        p.목표_건수 || 0,
        p.목표_연인원 || 0,
        p.실인원 || 0,
        p.건수 || 0,
        p.연인원 || 0,
        `${p.목표대비_실인원 || 0}%`,
        `${p.목표대비_건수 || 0}%`,
        `${p.목표대비_연인원 || 0}%`
      ]);
    });

    aoa.push([]);
    aoa.push(['■ 월간 총평 및 항목별 보고']);
    aoa.push(['항목', '내용', null, null, null, null, null, null, null, null, null]);
    aoa.push(['실적 총평', tPerf, null, null, null, null, null, null, null, null, null]);
    aoa.push(['예산(세입/세출)', tBudget, null, null, null, null, null, null, null, null, null]);
    aoa.push(['성과(특이사항)', tAchieve, null, null, null, null, null, null, null, null, null]);
    aoa.push(['향후 계획', tPlans, null, null, null, null, null, null, null, null, null]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!merges'] = [
      { s: {r:0, c:0}, e: {r:0, c:10} },
      { s: {r:1, c:0}, e: {r:1, c:10} },
      { s: {r:3, c:0}, e: {r:4, c:0} },
      { s: {r:3, c:1}, e: {r:4, c:1} },
      { s: {r:3, c:2}, e: {r:3, c:4} },
      { s: {r:3, c:5}, e: {r:3, c:7} },
      { s: {r:3, c:8}, e: {r:3, c:10} },
      { s: {r:5, c:0}, e: {r:5, c:1} },
    ];

    const reportStartRow = aoa.length - 4;
    for(let i=0; i<4; i++) {
      ws['!merges'].push({ s: {r: reportStartRow + i, c: 1}, e: {r: reportStartRow + i, c: 10} });
    }
    ws['!merges'].push({ s: {r: reportStartRow - 2, c: 0}, e: {r: reportStartRow - 2, c: 10} });
    ws['!merges'].push({ s: {r: reportStartRow - 1, c: 1}, e: {r: reportStartRow - 1, c: 10} });

    ws['!cols'] = [
      {wch: 15}, {wch: 25}, 
      {wch: 10}, {wch: 10}, {wch: 10}, 
      {wch: 10}, {wch: 10}, {wch: 10}, 
      {wch: 10}, {wch: 10}, {wch: 10}
    ];

    XLSX.utils.book_append_sheet(wb, ws, '실적 보고서');

    XLSX.writeFile(wb, `월별실적보고서_${teamName}_${year}년${month}월.xlsx`);

  } catch(e) {
    Utils.showToast('보고서 생성 중 오류가 발생했습니다.', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
};

