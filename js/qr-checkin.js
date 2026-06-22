// js/qr-checkin.js

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const programId = urlParams.get('program');
  const dateStr = urlParams.get('date');

  const loadingState = document.getElementById('loading-state');
  const searchState = document.getElementById('search-state');
  const successState = document.getElementById('success-state');
  const errorState = document.getElementById('error-state');
  const errorMsg = document.getElementById('error-msg');
  
  if (!token || !programId) {
    showError('유효하지 않은 접근입니다.');
    return;
  }

  // Pre-fetch program members (without auth, endpoint should allow limited member search for QR if token valid)
  let members = [];
  try {
    const res = await API.fetchGAS('verifyQRToken', { token, programId, date: dateStr });
    document.getElementById('program-info').textContent = `${res.data.programName} (${dateStr})`;
    members = res.data.members || [];
    
    loadingState.classList.add('hidden');
    searchState.classList.remove('hidden');
  } catch (e) {
    showError(e.message || 'QR코드가 만료되었거나 유효하지 않습니다.');
    return;
  }

  const nameInput = document.getElementById('name-input');
  const searchResults = document.getElementById('search-results');
  const btnSubmit = document.getElementById('btn-submit');
  
  let selectedName = '';

  nameInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    searchResults.innerHTML = '';
    selectedName = '';
    btnSubmit.disabled = true;
    
    if (val.length >= 1) {
      const filtered = members.filter(m => m.이름.includes(val));
      if (filtered.length > 0) {
        searchResults.style.display = 'block';
        filtered.forEach(m => {
          const div = document.createElement('div');
          div.className = 'search-item';
          div.textContent = m.이름;
          div.onclick = () => {
            nameInput.value = m.이름;
            selectedName = m.이름;
            searchResults.style.display = 'none';
            btnSubmit.disabled = false;
          };
          searchResults.appendChild(div);
        });
      } else {
        searchResults.style.display = 'none';
      }
    } else {
      searchResults.style.display = 'none';
    }
  });

  btnSubmit.addEventListener('click', async () => {
    if (!selectedName) return;
    
    btnSubmit.disabled = true;
    btnSubmit.textContent = '처리중...';
    
    try {
      await API.fetchGAS('selfCheckIn', { token, programId, date: dateStr, name: selectedName });
      searchState.classList.add('hidden');
      successState.classList.remove('hidden');
    } catch (e) {
      showError(e.message || '출석 처리에 실패했습니다.');
    }
  });

  function showError(msg) {
    loadingState.classList.add('hidden');
    searchState.classList.add('hidden');
    errorState.classList.remove('hidden');
    errorMsg.textContent = msg;
  }
});
