// js/members.js

let allMembers = [];
let filteredMembers = [];
let currentPage = 1;
const itemsPerPage = 20;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.updateUserUI();

  await loadMembers();

  document.getElementById('btn-search').addEventListener('click', applyFilters);
  
  document.getElementById('btn-prev').addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTable(); }
  });
  
  document.getElementById('btn-next').addEventListener('click', () => {
    if (currentPage * itemsPerPage < filteredMembers.length) { currentPage++; renderTable(); }
  });

  document.getElementById('member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveMember();
  });

  document.getElementById('csv-upload-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      const parsed = Utils.parseCSV(text);
      if (parsed.length > 0) {
        // 중복 방지 필터링: 이름, 시작일, 장애비장애구분
        const uniqueData = parsed.filter(newRow => {
          const newRowDate = Utils.formatDate(newRow.시작일);
          return !allMembers.some(existing => 
            existing.이름 === newRow.이름 && 
            Utils.formatDate(existing.시작일) === newRowDate && 
            existing.장애비장애구분 === newRow.장애비장애구분
          );
        });

        if (uniqueData.length === 0) {
          Utils.showToast('모든 데이터가 이미 존재하여 업로드할 항목이 없습니다.', 'warning');
          e.target.value = '';
          return;
        }

        const excludedCount = parsed.length - uniqueData.length;

        try {
          await API.fetchGAS('importMembersCSV', { csvData: uniqueData });
          let msg = `${uniqueData.length}건의 데이터가 업로드되었습니다.`;
          if (excludedCount > 0) msg += ` (중복 ${excludedCount}건 제외)`;
          Utils.showToast(msg, 'success');
          await loadMembers();
        } catch (err) { }
      }
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = ''; // reset
  });
});

async function loadMembers(forceRefresh = false) {
  try {
    const user = Auth.getUser();
    let teamName = undefined;
    if (user && user.role !== '관리자') {
      teamName = user.team; // Pass teamName to backend to filter members at the DB level for performance & security
    }

    const res = await API.fetchGAS('getMembers', { status: 'all', forceRefresh, teamName });
    let fetchedMembers = res.data || [];
    
    if (user && user.role !== '관리자' && user.role !== '팀장') {
      // 팀원은 자신이 담당하는 사업명과 관련된 회원만 표시
      const progsRes = await API.fetchGAS('getPersonalStats', { staffId: user.staffId });
      const assignedProgs = progsRes.data.programs || [];
      const assignedProgNames = assignedProgs.map(p => p.사업명.replace(/\s+/g, ''));
      fetchedMembers = fetchedMembers.filter(m => {
        const memberProgs = String(m.사업명 || '').split(',').map(s => s.replace(/\s+/g, ''));
        return memberProgs.some(mp => assignedProgNames.includes(mp));
      });
    }

    allMembers = fetchedMembers;
    // 이름 가나다순으로 정렬
    allMembers.sort((a, b) => String(a.이름).localeCompare(String(b.이름), 'ko-KR'));
    applyFilters();
  } catch (e) {
    document.querySelector('#members-table tbody').innerHTML = '<tr><td colspan="7" class="text-center">데이터를 불러오지 못했습니다.</td></tr>';
  }
}

window.forceRefreshMembers = async function() {
  await loadMembers(true);
  Utils.showToast('최신 데이터로 동기화되었습니다.', 'success');
}

function applyFilters() {
  const nameQ = document.getElementById('filter-name').value.toLowerCase();
  const statusQ = document.getElementById('filter-status').value;
  const typeQ = document.getElementById('filter-type').value;

  filteredMembers = allMembers.filter(m => {
    const matchName = m.이름.toLowerCase().includes(nameQ);
    const matchStatus = statusQ ? m.상태 === statusQ : true;
    const matchType = typeQ ? m.장애비장애구분 === typeQ : true;
    return matchName && matchStatus && matchType;
  });

  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.querySelector('#members-table tbody');
  tbody.innerHTML = '';

  const total = filteredMembers.length;
  if (total === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">검색 결과가 없습니다.</td></tr>';
    document.getElementById('page-info').textContent = '';
    return;
  }

  const startIdx = (currentPage - 1) * itemsPerPage;
  const endIdx = Math.min(startIdx + itemsPerPage, total);
  const pageData = filteredMembers.slice(startIdx, endIdx);

  const fragment = document.createDocumentFragment();
  pageData.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="이름">${m.이름}</td>
      <td data-label="시작일">${Utils.formatDate(m.시작일)}</td>
      <td data-label="장애여부"><span class="badge ${m.장애비장애구분 === '장애' ? 'badge-warning' : 'badge-neutral'}">${m.장애비장애구분}</span></td>
      <td data-label="구분"><span class="badge ${m.구분 === '그룹' ? 'badge-primary' : 'badge-neutral'}">${m.구분 || '개별'}</span></td>
      <td data-label="상태"><span class="badge ${m.상태 === '활성' ? 'badge-success' : (m.상태 === '보류' ? 'badge-warning' : 'badge-error')}">${m.상태}</span></td>
      <td data-label="팀명">${m.팀명 || ''}</td>
      <td data-label="사업명">${m.사업명 || ''}</td>
      <td data-label="메모">${m.메모 || ''}</td>
      <td data-label="관리">
        <button class="btn-ghost" onclick="editMember('${m.이름}')">수정</button>
        ${(Auth.hasRole('팀장') || Auth.hasRole('관리자')) ? `<button class="btn-ghost" style="color:var(--color-error);" onclick="requestDeleteMember('${m.이름}')">삭제</button>` : ''}
      </td>
    `;
    fragment.appendChild(tr);
  });
  tbody.appendChild(fragment);

  const totalPages = Math.ceil(total / itemsPerPage);
  document.getElementById('page-info').textContent = `총 ${total}명 (페이지 ${currentPage}/${totalPages})`;
}

window.openMemberModal = function() {
  document.getElementById('modal-title').textContent = '회원 추가';
  document.getElementById('member-form').reset();
  document.getElementById('original-name').value = '';
  document.getElementById('mem-start').value = Utils.formatDate(new Date());
  document.getElementById('mem-class').value = '개별';
  
  const user = Auth.getUser();
  if (user && user.team && user.role !== '관리자') {
    document.getElementById('mem-team').value = user.team;
  }
  
  document.getElementById('member-modal').classList.add('active');
}

window.closeMemberModal = function() {
  document.getElementById('member-modal').classList.remove('active');
}

window.editMember = function(name) {
  const m = allMembers.find(x => x.이름 === name);
  if (!m) return;
  
  document.getElementById('modal-title').textContent = '회원 수정';
  document.getElementById('original-name').value = m.이름;
  document.getElementById('mem-name').value = m.이름;
  document.getElementById('mem-start').value = Utils.formatDate(m.시작일);
  document.getElementById('mem-status').value = m.상태;
  document.getElementById('mem-type').value = m.장애비장애구분;
  document.getElementById('mem-class').value = m.구분 || '개별';
  document.getElementById('mem-team').value = m.팀명 || '';
  document.getElementById('mem-programs').value = m.사업명 || '';
  document.getElementById('mem-memo').value = m.메모 || '';
  
  document.getElementById('member-modal').classList.add('active');
}

async function saveMember() {
  const isEdit = document.getElementById('original-name').value;
  const data = {
    이름: document.getElementById('mem-name').value,
    시작일: document.getElementById('mem-start').value,
    장애비장애구분: document.getElementById('mem-type').value,
    구분: document.getElementById('mem-class').value,
    상태: document.getElementById('mem-status').value,
    팀명: document.getElementById('mem-team').value,
    사업명: document.getElementById('mem-programs').value,
    메모: document.getElementById('mem-memo').value
  };

  // 추가 시 중복 검사
  if (!isEdit) {
    const isDuplicate = allMembers.some(m => 
      m.이름 === data.이름 && 
      Utils.formatDate(m.시작일) === data.시작일 && 
      m.장애비장애구분 === data.장애비장애구분
    );
    if (isDuplicate) {
      Utils.showToast('이미 동일한 이름, 시작일, 장애여부를 가진 회원이 존재합니다.', 'error');
      return;
    }
  }

  try {
    if (isEdit) {
      await API.fetchGAS('updateMember', { name: isEdit, data });
      Utils.showToast('수정되었습니다.', 'success');
    } else {
      await API.fetchGAS('addMember', { data });
      Utils.showToast('추가되었습니다.', 'success');
    }
    closeMemberModal();
    await loadMembers();
  } catch (e) {}
}

window.downloadMembersCSV = function() {
  if (allMembers.length === 0) {
    Utils.showToast('다운로드할 회원 데이터가 없습니다.', 'error');
    return;
  }

  const headers = ['이름', '시작일', '장애비장애구분', '구분', '상태', '팀명', '사업명', '메모'];
  const escapeCSV = (val) => {
    const str = String(val == null ? '' : val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  let csv = headers.map(escapeCSV).join(',') + '\n';
  allMembers.forEach(m => {
    csv += [
      m.이름,
      Utils.formatDate(m.시작일),
      m.장애비장애구분,
      m.구분 || '개별',
      m.상태,
      m.팀명 || '',
      m.사업명 || '',
      m.메모 || ''
    ].map(escapeCSV).join(',') + '\n';
  });

  // BOM(Byte Order Mark)을 앞에 추가하여 엑셀에서 한글 깨짐 방지
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const today = Utils.formatDate(new Date());
  link.href = url;
  link.download = `회원목록_${today}.csv`;
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
let currentDeleteType = null; // 'member'

window.requestDeleteMember = function(name) {
  currentDeleteTarget = name;
  currentDeleteType = 'member';
  const user = Auth.getUser();
  
  if (!user.hasDeletePin) {
    document.getElementById('new-pin-input').value = '';
    document.getElementById('new-pin-confirm').value = '';
    document.getElementById('pin-setup-modal').classList.add('active');
  } else {
    document.getElementById('delete-target-msg').textContent = `'${name}' 회원을 삭제하려면 4자리 삭제 비밀번호를 입력하세요.`;
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
    // 바로 삭제 모달 띄우기
    if (currentDeleteTarget) {
      if (currentDeleteType === 'member') requestDeleteMember(currentDeleteTarget);
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
    if (currentDeleteType === 'member') {
      await API.fetchGAS('deleteMemberRecord', { name: currentDeleteTarget, pin: pin });
      Utils.showToast('회원이 삭제되었습니다.', 'success');
      closeDeleteConfirmModal();
      await loadMembers();
    }
  } catch (e) {
    Utils.showToast(e.message || '비밀번호가 틀렸거나 오류가 발생했습니다.', 'error');
  }
}
