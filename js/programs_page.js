// js/programs_page.js

let allPrograms = [];
let currentTab = '전체';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  await loadPrograms();
  renderTabs();

  document.getElementById('program-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProgram();
  });

  document.getElementById('csv-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const parsed = Utils.parseCSV(text);
      if (parsed.length > 0) {
        // 중복 방지 필터링: 팀명, 세부사업분류, 사업명
        const uniqueData = parsed.filter(newRow => {
          return !allPrograms.some(existing => 
            existing.팀명 === newRow.팀명 &&
            existing.세부사업분류 === newRow.세부사업분류 &&
            existing.사업명 === newRow.사업명
          );
        });

        if (uniqueData.length === 0) {
          Utils.showToast('모든 사업 데이터가 이미 존재하여 업로드할 항목이 없습니다.', 'warning');
          e.target.value = '';
          return;
        }

        const excludedCount = parsed.length - uniqueData.length;

        try {
          await API.fetchGAS('importProgramsCSV', { csvData: uniqueData });
          let msg = `${uniqueData.length}건의 사업이 업로드되었습니다.`;
          if (excludedCount > 0) msg += ` (중복 ${excludedCount}건 제외)`;
          Utils.showToast(msg, 'success');
          await loadPrograms();
        } catch (err) { }
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = ''; 
  });
});



async function loadPrograms(forceRefresh = false) {
  try {
    const user = Auth.getUser();
    const team = user.role === '관리자' ? '' : user.team;
    allPrograms = await ProgramsLogic.loadTeamPrograms(team, forceRefresh);
    renderGrid();
  } catch(e) {
    document.getElementById('programs-grid').innerHTML = '<p>데이터를 불러오지 못했습니다.</p>';
  }
}

window.forceRefreshPrograms = async function() {
  await loadPrograms(true);
  Utils.showToast('최신 데이터로 동기화되었습니다.', 'success');
}

function renderTabs() {
  const tabsDiv = document.getElementById('team-tabs');
  const user = Auth.getUser();
  
  let tabs = [];
  if (user.role === '관리자') {
    tabs = ['전체', ...ProgramsLogic.teams];
  } else {
    tabs = [user.team];
    currentTab = user.team;
  }

  tabsDiv.innerHTML = tabs.map(t => 
    `<button class="btn-${currentTab === t ? 'primary' : 'secondary'}" onclick="setTab('${t}')">${t}</button>`
  ).join('');
}

window.setTab = function(tab) {
  currentTab = tab;
  renderTabs();
  renderGrid();
}

function renderGrid() {
  const grid = document.getElementById('programs-grid');
  let filtered = allPrograms;
  if (currentTab !== '전체') {
    filtered = allPrograms.filter(p => p.팀명 === currentTab);
  }

  if (filtered.length === 0) {
    grid.innerHTML = '<p>등록된 사업이 없습니다.</p>';
    return;
  }

  grid.innerHTML = filtered.map(p => `
    <div class="glass-card">
      <div class="flex justify-between items-start mb-2">
        <h4 style="margin:0">${p.사업명}</h4>
        <span class="badge ${p.상태 === '활성' ? 'badge-success' : 'badge-warning'}">${p.상태 || '활성'}</span>
      </div>
      <div class="mb-2">
        <span class="badge badge-primary">${p.실적유형}</span>
        <span class="text-sub" style="font-size: 12px; margin-left: 8px;">${p.팀명}</span>
        ${p.담당자 ? `<span class="text-sub" style="font-size: 12px; margin-left: 8px;">담당: ${p.담당자}</span>` : ''}
      </div>
      
      <div class="mt-3 text-right">
        ${(Auth.hasRole('팀장') || Auth.hasRole('관리자')) ? `<button class="btn-ghost" style="color:var(--color-error); margin-right: 8px;" onclick="requestDeleteProgram('${p.사업ID}', '${p.사업명}')">삭제</button>` : ''}
        <button class="btn-ghost" onclick="editProgram('${p.사업ID}')">수정</button>
      </div>
    </div>
  `).join('');
}

window.openProgramModal = function() {
  document.getElementById('modal-title').textContent = '사업 추가';
  document.getElementById('program-form').reset();
  document.getElementById('original-id').value = '';
  document.getElementById('program-modal').classList.add('active');
}

window.closeProgramModal = function() {
  document.getElementById('program-modal').classList.remove('active');
}

window.editProgram = function(id) {
  const p = allPrograms.find(x => x.사업ID === id);
  if (!p) return;
  
  document.getElementById('modal-title').textContent = '사업 수정';
  document.getElementById('original-id').value = p.사업ID;
  document.getElementById('prog-team').value = p.팀명;
  document.getElementById('prog-cat1').value = p.사업분류;
  document.getElementById('prog-cat2').value = p.세부사업분류;
  document.getElementById('prog-name').value = p.사업명;
  document.getElementById('prog-type').value = p.실적유형;
  document.getElementById('prog-goal-real').value = p.목표_실인원 || 0;
  document.getElementById('prog-goal-accum').value = p.목표_연인원 || 0;
  document.getElementById('prog-goal-count').value = p.목표_건수 || 0;
  document.getElementById('prog-status').value = p.상태 || '활성';
  document.getElementById('prog-manager').value = p.담당자 || '';
  
  document.getElementById('program-modal').classList.add('active');
}

async function saveProgram() {
  const isEdit = document.getElementById('original-id').value;
  const data = {
    팀명: document.getElementById('prog-team').value,
    사업분류: document.getElementById('prog-cat1').value,
    세부사업분류: document.getElementById('prog-cat2').value,
    사업명: document.getElementById('prog-name').value,
    실적유형: document.getElementById('prog-type').value,
    목표_실인원: parseInt(document.getElementById('prog-goal-real').value, 10),
    목표_연인원: parseInt(document.getElementById('prog-goal-accum').value, 10),
    목표_건수: parseInt(document.getElementById('prog-goal-count').value, 10),
    상태: document.getElementById('prog-status').value,
    담당자: document.getElementById('prog-manager').value
  };

  // 추가 시 중복 검사
  if (!isEdit) {
    const isDuplicate = allPrograms.some(p => 
      p.팀명 === data.팀명 && 
      p.세부사업분류 === data.세부사업분류 && 
      p.사업명 === data.사업명
    );
    if (isDuplicate) {
      Utils.showToast('해당 팀에 이미 동일한 세부사업분류와 사업명을 가진 사업이 존재합니다.', 'error');
      return;
    }
  }

  try {
    if (isEdit) {
      await API.fetchGAS('updateProgram', { programId: isEdit, data });
      Utils.showToast('수정되었습니다.', 'success');
    } else {
      await API.fetchGAS('addProgram', { data });
      Utils.showToast('추가되었습니다.', 'success');
    }
    closeProgramModal();
    await loadPrograms();
  } catch (e) {}
}

window.downloadProgramsCSV = function() {
  if (allPrograms.length === 0) {
    Utils.showToast('다운로드할 사업 데이터가 없습니다.', 'error');
    return;
  }

  const headers = ['팀명', '사업분류', '세부사업분류', '사업명', '실적유형', '상태', '목표_실인원', '목표_건수', '목표_연인원', '담당자'];
  const escapeCSV = (val) => {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  let csv = headers.map(escapeCSV).join(',') + '\n';
  allPrograms.forEach(p => {
    csv += [
      p.팀명,
      p.사업분류,
      p.세부사업분류,
      p.사업명,
      p.실적유형,
      p.상태 || '활성',
      p.목표_실인원 || 0,
      p.목표_건수 || 0,
      p.목표_연인원 || 0,
      p.담당자 || ''
    ].map(escapeCSV).join(',') + '\n';
  });

  // BOM(Byte Order Mark)을 앞에 추가하여 엑셀에서 한글 깨짐 방지
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = Utils.formatDate(new Date());
  link.href = url;
  link.download = `사업목록_${today}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  Utils.showToast('CSV 파일이 다운로드되었습니다.', 'success');
}

// ==========================================
// Delete Logic
// ==========================================
let currentDeleteTarget = null;
let currentDeleteType = null; // 'program'

window.requestDeleteProgram = function(programId, programName) {
  currentDeleteTarget = { id: programId, name: programName };
  currentDeleteType = 'program';
  const user = Auth.getUser();
  
  if (!user.hasDeletePin) {
    document.getElementById('new-pin-input').value = '';
    document.getElementById('new-pin-confirm').value = '';
    document.getElementById('pin-setup-modal').classList.add('active');
  } else {
    document.getElementById('delete-target-msg').textContent = `'${programName}' 사업을 삭제하려면 4자리 삭제 비밀번호를 입력하세요.`;
    document.getElementById('delete-pin-input').value = '';
    document.getElementById('delete-confirm-modal').classList.add('active');
  }
}

window.closePinSetupModal = function() {
  document.getElementById('pin-setup-modal').classList.remove('active');
}

window.submitPinSetup = async function() {
  const pin1 = document.getElementById('new-pin-input').value;
  const pin2 = document.getElementById('new-pin-confirm').value;
  
  if (!pin1 || pin1.length !== 4) return Utils.showToast('4자리 숫자를 입력해주세요.', 'error');
  if (pin1 !== pin2) return Utils.showToast('비밀번호가 일치하지 않습니다.', 'error');
  
  try {
    await API.fetchGAS('setDeletePin', { pin: pin1 });
    Auth.updateUserInfo({ hasDeletePin: true });
    Utils.showToast('삭제 비밀번호가 설정되었습니다. 이제 삭제할 수 있습니다.', 'success');
    closePinSetupModal();
    if (currentDeleteTarget && currentDeleteType === 'program') {
      requestDeleteProgram(currentDeleteTarget.id, currentDeleteTarget.name);
    }
  } catch (e) {
    Utils.showToast(e.message || '오류가 발생했습니다.', 'error');
  }
}

window.closeDeleteConfirmModal = function() {
  document.getElementById('delete-confirm-modal').classList.remove('active');
  currentDeleteTarget = null;
}

window.submitDelete = async function() {
  if (!currentDeleteTarget) return;
  const pin = document.getElementById('delete-pin-input').value;
  if (!pin || pin.length !== 4) return Utils.showToast('4자리 숫자를 입력해주세요.', 'error');
  
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  
  try {
    if (currentDeleteType === 'program') {
      await API.fetchGAS('deleteProgramRecord', { programId: currentDeleteTarget.id, pin: pin });
      Utils.showToast('사업이 삭제되었습니다.', 'success');
      closeDeleteConfirmModal();
      await loadPrograms();
    }
  } catch (e) {
    Utils.showToast(e.message || '비밀번호가 틀렸거나 오류가 발생했습니다.', 'error');
  }
}
