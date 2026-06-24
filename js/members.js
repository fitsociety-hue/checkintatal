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
        try {
          await API.fetchGAS('importMembersCSV', { csvData: parsed });
          Utils.showToast(`${parsed.length}건의 데이터가 업로드되었습니다.`, 'success');
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
    const res = await API.fetchGAS('getMembers', { status: 'all', forceRefresh });
    allMembers = res.data || [];
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

  pageData.forEach(m => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${m.이름}</td>
      <td>${Utils.formatDate(m.시작일)}</td>
      <td><span class="badge ${m.상태 === '활성' ? 'badge-success' : (m.상태 === '보류' ? 'badge-warning' : 'badge-error')}">${m.상태}</span></td>
      <td><span class="badge ${m.장애비장애구분 === '장애' ? 'badge-warning' : 'badge-neutral'}">${m.장애비장애구분}</span></td>
      <td><span class="badge ${m.구분 === '그룹' ? 'badge-primary' : 'badge-neutral'}">${m.구분 || '개별'}</span></td>
      <td>${m.사업명 || ''}</td>
      <td>${m.메모 || ''}</td>
      <td>
        <button class="btn-ghost" onclick="editMember('${m.이름}')">수정</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalPages = Math.ceil(total / itemsPerPage);
  document.getElementById('page-info').textContent = `총 ${total}명 (페이지 ${currentPage}/${totalPages})`;
}

window.openMemberModal = function() {
  document.getElementById('modal-title').textContent = '회원 추가';
  document.getElementById('member-form').reset();
  document.getElementById('original-name').value = '';
  document.getElementById('mem-start').value = Utils.formatDate(new Date());
  document.getElementById('mem-class').value = '개별';
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
  document.getElementById('mem-programs').value = m.사업명 || '';
  document.getElementById('mem-memo').value = m.메모 || '';
  
  document.getElementById('member-modal').classList.add('active');
}

async function saveMember() {
  const isEdit = document.getElementById('original-name').value;
  const data = {
    이름: document.getElementById('mem-name').value,
    시작일: document.getElementById('mem-start').value,
    상태: document.getElementById('mem-status').value,
    장애비장애구분: document.getElementById('mem-type').value,
    구분: document.getElementById('mem-class').value,
    사업명: document.getElementById('mem-programs').value,
    메모: document.getElementById('mem-memo').value
  };

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

  const headers = ['이름', '시작일', '상태', '장애비장애구분', '구분', '사업명', '메모'];
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
      m.상태,
      m.장애비장애구분,
      m.구분 || '개별',
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
