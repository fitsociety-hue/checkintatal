// ==============================================================================
// 강동어울림복지관 출석부 시스템 백엔드 (Google Apps Script)
// ==============================================================================

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  return handleRequest(e, 'POST');
}

function doGet(e) {
  return handleRequest(e, 'GET');
}

function handleRequest(e, method) {
  try {
    let payload = {};
    if (method === 'POST') {
      if (e.parameter.data) {
        payload = JSON.parse(e.parameter.data);
      } else if (e.postData && e.postData.contents) {
        payload = JSON.parse(e.postData.contents);
      }
    } else {
      if (e.parameter.data) {
        payload = JSON.parse(e.parameter.data);
      }
    }

    const action = payload.action;
    let result = null;

    // 인증 검증 로직 (login, register 등은 제외)
    let user = null;
    const bypassActions = ['login', 'register', 'verifyQRToken', 'selfCheckIn', 'setupAutoSyncTrigger'];
    if (!bypassActions.includes(action)) {
      if (!payload.token) throw new Error('인증 토큰이 필요합니다.');
      user = verifyToken(payload.token);
      if (!user) throw new Error('유효하지 않거나 만료된 토큰입니다.');
    }

    // 캐시 강제 무효화 요청 처리 (근본적인 동기화 문제 해결)
    if (payload.forceRefresh) {
      invalidateCache();
    }

    switch (action) {
      case 'login': result = login(payload.team, payload.name, payload.password); break;
      case 'register': result = registerUser(payload.team, payload.name, payload.password, payload.role); break;
      
      // 회원 관리
      case 'getMembers': result = getMembers(payload.programId, payload.status, payload.programName); break;
      case 'addMember': result = addMember(payload.data); break;
      case 'updateMember': result = updateMember(payload.name, payload.data); break;
      case 'importMembersCSV': result = importMembersCSV(payload.csvData); break;
      
      // 사업 관리
      case 'getPrograms': result = getPrograms(payload.teamName, payload.status); break;
      case 'addProgram': result = addProgram(payload.data); break;
      case 'updateProgram': result = updateProgram(payload.programId, payload.data); break;
      case 'importProgramsCSV': result = importProgramsCSV(payload.csvData); break;
      
      // 출석 관리
      case 'checkAttendance': result = checkAttendance(payload.programId, payload.date, payload.attendanceList, user); break;
      case 'getAttendanceSheet': result = getAttendanceSheet(payload.programId, payload.date); break;
      case 'submitCountOnly': result = submitCountOnly(payload.programId, payload.date, payload.count, user); break;
      
      // QR 출석
      case 'getQRToken': result = getQRToken(payload.programId, payload.date); break;
      case 'verifyQRToken': result = verifyQRTokenAction(payload.token, payload.programId, payload.date); break;
      case 'selfCheckIn': result = selfCheckIn(payload.token, payload.programId, payload.date, payload.name); break;
      
      // 실적 집계
      case 'getStats': result = getStats(payload.teamName, payload.year, payload.month); break;
      case 'getAllStats': result = getAllStats(payload.year, payload.month); break;
      case 'getPersonalStats': result = getPersonalStats(payload.staffId, payload.year, payload.month); break;
      
      // 시스템 관리
      case 'setupAutoSyncTrigger': result = setupAutoSyncTrigger(); break;
      
      default:
        throw new Error('알 수 없는 Action입니다: ' + action);
    }

    return createResponse({ success: true, data: result });
  } catch (error) {
    return createResponse({ success: false, message: error.message });
  }
}

function createResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// 유틸리티 함수
// ==============================================================================

function getSheet(sheetName) {
  const ssId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  const ss = ssId ? SpreadsheetApp.openById(ssId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('연결된 구글 시트를 찾을 수 없습니다.');
  
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    const headers = getHeadersForSheet(sheetName);
    if (headers.length > 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
    }
  }
  
  return sheet;
}

function getHeadersForSheet(sheetName) {
  switch (sheetName) {
    case '직원_마스터': return ['직원ID', '이름', '팀명', '직위', '비밀번호', '상태', '담당사업IDs'];
    case '사업_마스터': return ['팀명', '사업분류', '세부사업분류', '사업명', '실적유형', '상태', '목표_실인원', '목표_건수', '목표_연인원', '담당자', '사업ID'];
    case '회원_마스터': return ['이름', '시작일', '상태', '장애비장애구분', '구분', '사업명', '메모'];
    case '출석_원장': return ['출석ID', '날짜', '사업ID', '사업명', '팀명', '이름', '출석여부', '건수', '입력방식', '입력자', '입력시각'];
    case '실적_집계': return ['팀명', '사업명', '년도', '월', '실인원', '건수', '연인원', '목표대비_실인원(%)', '목표대비_건수(%)', '목표대비_연인원(%)'];
    default: return [];
  }
}

function getSheetDataAsJSON(sheetName) {
  const version = getCacheVersion();
  const cacheKey = 'SHEET_' + sheetName + '_' + version;
  const cached = getCacheChunked(cacheKey);
  if (cached) return JSON.parse(cached);

  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  
  const expectedHeaders = getHeadersForSheet(sheetName);
  const currentHeaders = data[0].map(h => String(h).trim());
  
  // 정확한 헤더 일치 여부 확인
  const isExactMatch = expectedHeaders.length === currentHeaders.length && 
                       expectedHeaders.every((h, i) => currentHeaders[i] === h);
  
  if (!isExactMatch) {
    // 1) 헤더가 아예 없거나 첫 컬럼부터 다르면 (신규 시트 또는 잘못된 시트) -> 초기화
    if (currentHeaders.length === 0 || currentHeaders[0] !== expectedHeaders[0]) {
      sheet.insertRowBefore(1);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight("bold").setBackground("#f3f3f3");
      sheet.setFrozenRows(1);
      return getSheetDataAsJSON(sheetName);
    }
    
    // 2) 첫 컬럼은 맞지만 (ex: 이름) 다른 컬럼 구성이 변경된 경우 -> 기존 데이터 마이그레이션
    const oldRows = [];
    if (data.length > 1) {
      for (let i = 1; i < data.length; i++) {
        let obj = {};
        for (let j = 0; j < currentHeaders.length; j++) {
          if (currentHeaders[j]) {
            obj[currentHeaders[j]] = data[i][j];
          }
        }
        oldRows.push(obj);
      }
    }
    
    // 시트 초기화 후 새 헤더 작성
    sheet.clear();
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    
    // 기존 데이터 새 포맷에 맞게 재작성
    if (oldRows.length > 0) {
      const newData = oldRows.map(row => {
        return expectedHeaders.map(h => {
          if (h === '구분' && !row[h]) return '개별';
          if (h === '장애비장애구분' && !row[h]) return '비장애';
          if (h === '상태' && !row[h]) return '활성';
          return row[h] !== undefined ? row[h] : '';
        });
      });
      sheet.getRange(2, 1, newData.length, expectedHeaders.length).setValues(newData);
    }
    
    // 업데이트된 시트 기준으로 다시 데이터 불러오기
    return getSheetDataAsJSON(sheetName);
  }

  if (data.length < 2) return [];
  
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    let obj = {};
    for (let j = 0; j < expectedHeaders.length; j++) {
      obj[expectedHeaders[j]] = data[i][j];
    }
    rows.push(obj);
  }
  
  putCacheChunked(cacheKey, JSON.stringify(rows));
  return rows;
}

// ==============================================================================
// 인증 및 권한
// ==============================================================================

function login(team, name, password) {
  const staffData = getSheetDataAsJSON('직원_마스터');
  
  // 관리자는 팀 구분을 안할 수 있으므로, 팀 필터링 적용 혹은 이름+비번만으로 매칭할 수 있음
  const user = staffData.find(s => 
    String(s.이름 || '').trim() === String(name || '').trim() && 
    (String(s.비밀번호 || '').trim() === String(password || '').trim() || String(s.비밀번호해시 || '').trim() === String(password || '').trim()) && 
    String(s.상태 || '').trim() !== '비활성'
  );
  
  if (!user) {
    // 관리자의 경우 하드코딩된 마스터 계정 허용 (초기 세팅용)
    if (team === '관리자' && name === 'admin' && password === 'admin') {
      const mockUser = { staffId: 'ADMIN', name: '최고관리자', team: '관리자', role: '관리자' };
      return { token: createToken(mockUser), user: mockUser };
    }
    throw new Error('이름 또는 비밀번호가 일치하지 않습니다.');
  }

  const payload = {
    staffId: user.직원ID,
    name: user.이름,
    team: user.팀명,
    role: user.직위, // 관리자, 팀장, 팀원
    담당사업IDs: user.담당사업IDs
  };
  
  return { token: createToken(payload), user: payload };
}

function createToken(payload) {
  payload.exp = new Date().getTime() + (8 * 60 * 60 * 1000); // 8시간 만료
  const secret = PropertiesService.getScriptProperties().getProperty('JWT_SECRET') || 'DEFAULT_SECRET_KEY';
  const header = Utilities.base64Encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payloadStr = Utilities.base64Encode(JSON.stringify(payload));
  const signature = Utilities.base64Encode(Utilities.computeHmacSha256Signature(header + '.' + payloadStr, secret));
  return `${header}.${payloadStr}.${signature}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Utilities.newBlob(Utilities.base64Decode(parts[1])).getDataAsString());
    if (new Date().getTime() > payload.exp) return null; // 만료됨
    return payload;
  } catch (e) {
    return null;
  }
}

function registerUser(team, name, password, role) {
  const sheet = getSheet('직원_마스터');
  const staffData = getSheetDataAsJSON('직원_마스터');
  
  // 중복 가입 방지 (소속 팀명 + 이름 동일하면 가입 거부)
  const isDuplicate = staffData.some(s => s.이름 === name && s.팀명 === team);
  if (isDuplicate) {
    throw new Error('이미 동일한 소속과 이름으로 가입된 계정이 있습니다.');
  }

  // 중복이 아니면 가입 허용
  const newId = 'STAFF_' + new Date().getTime();
  sheet.appendRow([
    newId, name, team, role || '팀원', password, '활성', ''
  ]);
  
  return true;
}

// ==============================================================================
// 사업 관리
// ==============================================================================

function getPrograms(teamName, status) {
  let programs = getSheetDataAsJSON('사업_마스터');
  if (teamName && teamName !== '전체') {
    programs = programs.filter(p => p.팀명 === teamName);
  }
  if (status && status !== 'all') {
    programs = programs.filter(p => p.상태 === status);
  }
  return programs;
}

function addProgram(data) {
  const sheet = getSheet('사업_마스터');
  const programId = 'PROG_' + new Date().getTime();
  sheet.appendRow([
    data.팀명, data.사업분류, data.세부사업분류, data.사업명, data.실적유형,
    data.상태 || '활성', data.목표_실인원 || 0, data.목표_건수 || 0, data.목표_연인원 || 0,
    data.담당자 || '', programId
  ]);
  invalidateCache();
  return { programId };
}

function updateProgram(programId, data) {
  const sheet = getSheet('사업_마스터');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][10] === programId) {
      sheet.getRange(i + 1, 1, 1, 10).setValues([[
        data.팀명, data.사업분류, data.세부사업분류, data.사업명, data.실적유형,
        data.상태, data.목표_실인원, data.목표_건수, data.목표_연인원, data.담당자
      ]]);
      invalidateCache();
      return true;
    }
  }
  throw new Error('해당 사업을 찾을 수 없습니다.');
}

function importProgramsCSV(csvData) {
  const sheet = getSheet('사업_마스터');
  csvData.forEach(row => {
    sheet.appendRow([
      row.팀명, row.사업분류, row.세부사업분류, row.사업명, row.실적유형,
      row.상태 || '활성', row.목표_실인원 || 0, row.목표_건수 || 0, row.목표_연인원 || 0,
      row.담당자 || '', 'PROG_' + Math.floor(Math.random()*10000000)
    ]);
  });
  invalidateCache();
  return true;
}

// ==============================================================================
// 회원 관리
// ==============================================================================

function getMembers(programId, status, programName) {
  let members = getSheetDataAsJSON('회원_마스터');
  if (status && status !== 'all') {
    members = members.filter(m => m.상태 === status);
  }
  // 사업명으로 필터링 (회원의 사업명 필드에 해당 사업명이 포함되어 있는지 확인)
  if (programName) {
    members = members.filter(m => {
      const memberPrograms = String(m.사업명 || '').split(',').map(s => s.trim());
      return memberPrograms.includes(programName);
    });
  }
  return members;
}

function addMember(data) {
  const sheet = getSheet('회원_마스터');
  sheet.appendRow([
    data.이름, data.시작일, data.상태 || '활성', data.장애비장애구분 || '비장애', data.구분 || '개별', data.사업명 || '', data.메모 || ''
  ]);
  invalidateCache();
  return true;
}

function updateMember(name, data) {
  const sheet = getSheet('회원_마스터');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === name) {
      sheet.getRange(i + 1, 1, 1, 7).setValues([[
        data.이름, data.시작일, data.상태 || '활성', data.장애비장애구분 || '비장애', data.구분 || '개별', data.사업명 || '', data.메모 || ''
      ]]);
      invalidateCache();
      return true;
    }
  }
  throw new Error('해당 회원을 찾을 수 없습니다.');
}

function importMembersCSV(csvData) {
  const sheet = getSheet('회원_마스터');
  csvData.forEach(row => {
    sheet.appendRow([
      row.이름, row.시작일, row.상태 || '활성', row.장애비장애구분 || '비장애', row.구분 || '개별', row.사업명 || '', row.메모 || ''
    ]);
  });
  invalidateCache();
  return true;
}

// ==============================================================================
// 출석 관리
// ==============================================================================

function getAttendanceSheet(programId, date) {
  const attData = getSheetDataAsJSON('출석_원장');
  return attData.filter(a => a.사업ID === programId && formatDateStr(a.날짜) === date);
}

function checkAttendance(programId, date, attendanceList, user) {
  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  if (!prog) throw new Error('사업을 찾을 수 없습니다.');
  
  // 삭제 후 덮어쓰기를 위해 기존 해당일 데이터 삭제 (간단한 구현)
  deleteExistingAttendance(programId, date);

  attendanceList.forEach(att => {
    const attId = 'ATT_' + new Date().getTime() + Math.floor(Math.random()*1000);
    sheet.appendRow([
      attId, date, programId, prog.사업명, prog.팀명, att.이름, 
      att.출석여부, att.건수 || 0, '직원입력', user.name, new Date()
    ]);
  });
  
  recalcStatsDirectly();
  invalidateCache();
  return true;
}

function submitCountOnly(programId, date, count, user) {
  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  if (!prog) throw new Error('사업을 찾을 수 없습니다.');

  deleteExistingAttendance(programId, date);

  const attId = 'ATT_' + new Date().getTime();
  sheet.appendRow([
    attId, date, programId, prog.사업명, prog.팀명, '건수입력용_무명', 
    'O', count, '직원입력', user.name, new Date()
  ]);
  
  recalcStatsDirectly();
  invalidateCache();
  return true;
}

function deleteExistingAttendance(programId, date) {
  const sheet = getSheet('출석_원장');
  const vals = sheet.getDataRange().getValues();
  if (vals.length <= 1) return;
  const newVals = [vals[0]]; // keep header
  for (let i = 1; i < vals.length; i++) {
    if (!(vals[i][2] === programId && formatDateStr(vals[i][1]) === date)) {
      newVals.push(vals[i]);
    }
  }
  sheet.clearContents();
  if (newVals.length > 0) {
    sheet.getRange(1, 1, newVals.length, newVals[0].length).setValues(newVals);
  }
  
  invalidateCache();
  return true;
}

// ==============================================================================
// QR 출석
// ==============================================================================

function getQRToken(programId, date) {
  const token = Utilities.getUuid();
  const cache = CacheService.getScriptCache();
  cache.put('QR_' + token, JSON.stringify({ programId, date }), 300); // 5분 유효
  return { token };
}

function verifyQRTokenAction(token, programId, date) {
  const cache = CacheService.getScriptCache();
  const cachedStr = cache.get('QR_' + token);
  if (!cachedStr) throw new Error('QR코드가 만료되었습니다.');
  
  const parsed = JSON.parse(cachedStr);
  if (parsed.programId !== programId || parsed.date !== date) {
    throw new Error('유효하지 않은 QR 정보입니다.');
  }
  
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);
  
  const members = getSheetDataAsJSON('회원_마스터').filter(m => m.상태 === '활성');
  
  return { programName: prog.사업명, members: members };
}

function selfCheckIn(token, programId, date, name) {
  verifyQRTokenAction(token, programId, date); // 만료 검증

  const sheet = getSheet('출석_원장');
  const programs = getSheetDataAsJSON('사업_마스터');
  const prog = programs.find(p => p.사업ID === programId);

  const attId = 'ATT_' + new Date().getTime();
  sheet.appendRow([
    attId, date, programId, prog.사업명, prog.팀명, name, 
    'O', 1, 'QR', name, new Date()
  ]);
  
  invalidateCache();
  return true;
}

// ==============================================================================
// 실적 집계 
// ==============================================================================

function formatDateStr(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

function recalcStatsDirectly() {
  // 간단하게 시트를 리프레시 하는 용도의 함수입니다.
  // 실제 대용량 처리에서는 별도의 시간 트리거로 돌리는 것을 권장합니다.
}

function getStats(teamName, year, month) {
  const now = new Date();
  const targetYear = parseInt(year) || now.getFullYear();
  const targetMonthStr = String(month || (now.getMonth() + 1));
  const isAllMonths = (targetMonthStr === 'all');
  const targetMonth = isAllMonths ? 12 : parseInt(targetMonthStr);

  const progs = getSheetDataAsJSON('사업_마스터').filter(p => p.팀명 === teamName);
  const attData = getSheetDataAsJSON('출석_원장');
  
  // 회원 구분 매핑용
  const memberMap = {};
  getSheetDataAsJSON('회원_마스터').forEach(m => {
    memberMap[m.이름] = m.구분 || '개별';
  });

  // 해당 팀의 사업ID 목록
  const teamProgIds = progs.map(p => p.사업ID);
  const progMap = {};
  progs.forEach(p => { progMap[p.사업ID] = p; });

  // 실인원용 출석 데이터 필터 (해당 연도 1월 1일부터 선택월 말일까지 누적)
  const cumulativeAtt = attData.filter(a => {
    if (!teamProgIds.includes(a.사업ID)) return false;
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return isAllMonths ? true : (mVal <= targetMonth);
  });

  // 연인원/건수용 출석 데이터 필터 (선택월만 필터)
  const monthAtt = attData.filter(a => {
    if (!teamProgIds.includes(a.사업ID)) return false;
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return isAllMonths ? true : (mVal === targetMonth);
  });

  // 팀 전체 실인원 집계 (누적)
  const uniqueNames = new Set();
  cumulativeAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
    if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명') {
      uniqueNames.add(a.이름);
    }
  });
  const realCount = uniqueNames.size;

  // 팀 전체 연인원 및 건수 집계 (선택월 단일)
  let totalAccum = 0;
  let totalCount = 0;

  // 사업별/날짜별 그룹화를 위한 준비
  const dailyAttByProg = {}; // progId -> dateStr -> [attRecords]
  
  monthAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;

    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
    if (isMemberType) {
      if (a.출석여부 === 'O') {
        totalAccum++;
      }
      
      // 날짜별 그룹화
      const dateStr = formatDateStr(a.날짜);
      if (!dailyAttByProg[a.사업ID]) dailyAttByProg[a.사업ID] = {};
      if (!dailyAttByProg[a.사업ID][dateStr]) dailyAttByProg[a.사업ID][dateStr] = [];
      dailyAttByProg[a.사업ID][dateStr].push(a);
    } else {
      // 건수 전용
      totalCount += Number(a.건수) || 0;
    }
  });

  // 날짜별로 그룹/개별 건수 계산
  Object.keys(dailyAttByProg).forEach(progId => {
    const datesObj = dailyAttByProg[progId];
    Object.keys(datesObj).forEach(dateStr => {
      const records = datesObj[dateStr];
      let hasGroupCheck = false;
      let individualChecks = 0;
      
      records.forEach(a => {
        if (a.출석여부 === 'O') {
          const type = memberMap[a.이름] || '개별';
          if (type === '그룹') {
            hasGroupCheck = true;
          } else {
            individualChecks++;
          }
        }
      });
      
      const dayCount = (hasGroupCheck ? 1 : 0) + individualChecks;
      totalCount += dayCount;
    });
  });

  // 사업별 상세 계산
  let totalProgRateSum = 0;
  let activeProgCount = 0;

  const programStats = progs.map(p => {
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
    
    // 이 사업의 누적 실인원 계산
    const pCumAtt = cumulativeAtt.filter(a => a.사업ID === p.사업ID);
    const pNames = new Set();
    pCumAtt.forEach(a => {
      if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명') {
        pNames.add(a.이름);
      }
    });
    
    // 이 사업의 선택월 연인원 및 건수 계산
    const pMonthAtt = monthAtt.filter(a => a.사업ID === p.사업ID);
    let pAccum = 0;
    let pCount = 0;
    
    if (isMemberType) {
      // 연인원
      pMonthAtt.forEach(a => {
        if (a.출석여부 === 'O') pAccum++;
      });
      
      // 일자별 건수 집계
      const pDaily = {};
      pMonthAtt.forEach(a => {
        const dateStr = formatDateStr(a.날짜);
        if (!pDaily[dateStr]) pDaily[dateStr] = [];
        pDaily[dateStr].push(a);
      });
      
      Object.keys(pDaily).forEach(dateStr => {
        const records = pDaily[dateStr];
        let hasGroup = false;
        let indvCount = 0;
        records.forEach(a => {
          if (a.출석여부 === 'O') {
            const mType = memberMap[a.이름] || '개별';
            if (mType === '그룹') {
              hasGroup = true;
            } else {
              indvCount++;
            }
          }
        });
        pCount += (hasGroup ? 1 : 0) + indvCount;
      });
    } else {
      // 건수 전용
      pMonthAtt.forEach(a => {
        pCount += Number(a.건수) || 0;
      });
    }

    const gReal = Number(p.목표_실인원) || 0;
    const gCount = Number(p.목표_건수) || 0;
    const gAccum = Number(p.목표_연인원) || 0;

    const rateReal = gReal > 0 ? Math.round((pNames.size / gReal) * 100) : 0;
    const rateCount = gCount > 0 ? Math.round((pCount / gCount) * 100) : 0;
    const rateAccum = gAccum > 0 ? Math.round((pAccum / gAccum) * 100) : 0;

    let mainRate = 0;
    if (isMemberType) {
      mainRate = rateAccum;
    } else {
      mainRate = rateCount;
    }
    
    totalProgRateSum += mainRate;
    activeProgCount++;

    return {
      팀명: p.팀명,
      사업명: p.사업명,
      실인원: isMemberType ? pNames.size : 0,
      건수: pCount,
      parentName: p.사업분류,
      연인원: isMemberType ? pAccum : 0,
      '목표대비_실인원': rateReal,
      '목표대비_건수': rateCount,
      '목표대비_연인원': rateAccum
    };
  });

  const rate = activeProgCount > 0 ? Math.round(totalProgRateSum / activeProgCount) : 0;

  return {
    real: realCount,
    accum: totalAccum,
    count: totalCount,
    rate: rate,
    totalRealCount: realCount,
    totalItemCount: totalCount,
    totalAccumCount: totalAccum,
    avgAchieveRate: rate,
    programs: programStats
  };
}

function getAllStats(year, month) {
  const now = new Date();
  const targetYear = parseInt(year) || now.getFullYear();
  const targetMonthStr = String(month || (now.getMonth() + 1));
  const isAllMonths = (targetMonthStr === 'all');
  const targetMonth = isAllMonths ? 12 : parseInt(targetMonthStr);

  const teams = ['지역연계팀', '맞춤지원팀', '건강문화팀', '성장지원팀', '전략기획팀', '미래경영팀'];
  const allProgs = getSheetDataAsJSON('사업_마스터');
  const attData = getSheetDataAsJSON('출석_원장');
  
  // 회원 구분 매핑용
  const memberMap = {};
  getSheetDataAsJSON('회원_마스터').forEach(m => {
    memberMap[m.이름] = m.구분 || '개별';
  });

  const progMap = {};
  allProgs.forEach(p => { progMap[p.사업ID] = p; });

  // 실인원용 출석 데이터 필터 (해당 연도 1월 1일부터 선택월 말일까지 누적)
  const cumulativeAtt = attData.filter(a => {
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return isAllMonths ? true : (mVal <= targetMonth);
  });

  // 연인원/건수용 출석 데이터 필터 (선택월만 필터)
  const monthAtt = attData.filter(a => {
    const d = new Date(a.날짜);
    if (d.getFullYear() !== targetYear) return false;
    const mVal = d.getMonth() + 1;
    return isAllMonths ? true : (mVal === targetMonth);
  });

  let grandReal = new Set();
  let grandAccum = 0;
  let grandCount = 0;

  // 전체 실인원 집계 (누적)
  cumulativeAtt.forEach(a => {
    const p = progMap[a.사업ID];
    if (!p) return;
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
    if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명') {
      grandReal.add(a.이름);
    }
  });

  let totalAllProgRateSum = 0;
  let activeAllProgCount = 0;

  const teamStats = teams.map(team => {
    const teamProgs = allProgs.filter(p => p.팀명 === team);
    const teamProgIds = teamProgs.map(p => p.사업ID);
    const teamAtt = monthAtt.filter(a => teamProgIds.includes(a.사업ID));

    let tAccum = 0;
    let tCount = 0;
    const dailyAttByProg = {}; // progId -> dateStr -> [records]

    teamAtt.forEach(a => {
      const p = progMap[a.사업ID];
      if (!p) return;
      
      const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
      if (isMemberType) {
        if (a.출석여부 === 'O') {
          tAccum++;
          grandAccum++;
        }
        const dateStr = formatDateStr(a.날짜);
        if (!dailyAttByProg[a.사업ID]) dailyAttByProg[a.사업ID] = {};
        if (!dailyAttByProg[a.사업ID][dateStr]) dailyAttByProg[a.사업ID][dateStr] = [];
        dailyAttByProg[a.사업ID][dateStr].push(a);
      } else {
        tCount += Number(a.건수) || 0;
      }
    });

    // 날짜별 그룹/개별 건수 계산
    Object.keys(dailyAttByProg).forEach(progId => {
      const datesObj = dailyAttByProg[progId];
      Object.keys(datesObj).forEach(dateStr => {
        const records = datesObj[dateStr];
        let hasGroup = false;
        let indvCount = 0;
        records.forEach(a => {
          if (a.출석여부 === 'O') {
            const mType = memberMap[a.이름] || '개별';
            if (mType === '그룹') {
              hasGroup = true;
            } else {
              indvCount++;
            }
          }
        });
        tCount += (hasGroup ? 1 : 0) + indvCount;
      });
    });
    grandCount += tCount;

    // 각 팀의 사업들 달성률 합산 및 평균
    let teamProgRateSum = 0;
    let teamProgCount = 0;

    teamProgs.forEach(p => {
      const progAtt = teamAtt.filter(a => a.사업ID === p.사업ID);
      let pCount = 0, pAccum = 0;
      
      const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
      
      if (isMemberType) {
        progAtt.forEach(a => {
          if (a.출석여부 === 'O') pAccum++;
        });

        // 일자별 건수 집계
        const pDaily = {};
        progAtt.forEach(a => {
          const dateStr = formatDateStr(a.날짜);
          if (!pDaily[dateStr]) pDaily[dateStr] = [];
          pDaily[dateStr].push(a);
        });

        Object.keys(pDaily).forEach(dateStr => {
          const records = pDaily[dateStr];
          let hasGroup = false;
          let indvCount = 0;
          records.forEach(a => {
            if (a.출석여부 === 'O') {
              const mType = memberMap[a.이름] || '개별';
              if (mType === '그룹') hasGroup = true;
              else indvCount++;
            }
          });
          pCount += (hasGroup ? 1 : 0) + indvCount;
        });
      } else {
        progAtt.forEach(a => {
          pCount += Number(a.건수) || 0;
        });
      }

      const gCount = Number(p.목표_건수) || 0;
      const gAccum = Number(p.목표_연인원) || 0;

      let mainRate = 0;
      if (isMemberType) {
        mainRate = gAccum > 0 ? Math.round((pAccum / gAccum) * 100) : 0;
      } else {
        mainRate = gCount > 0 ? Math.round((pCount / gCount) * 100) : 0;
      }

      teamProgRateSum += mainRate;
      teamProgCount++;

      totalAllProgRateSum += mainRate;
      activeAllProgCount++;
    });

    const teamRate = teamProgCount > 0 ? Math.round(teamProgRateSum / teamProgCount) : 0;
    return { team: team, rate: teamRate };
  });

  const avgRate = activeAllProgCount > 0 ? Math.round(totalAllProgRateSum / activeAllProgCount) : 0;

  // 사업별 상세
  const programStats = allProgs.map(p => {
    const isMemberType = (p.실적유형 !== '건수' && p.실적유형 !== '건수만');
    
    // 이 사업의 누적 실인원
    const pCumAtt = cumulativeAtt.filter(a => a.사업ID === p.사업ID);
    const pNames = new Set();
    pCumAtt.forEach(a => {
      if (isMemberType && a.출석여부 === 'O' && a.이름 !== '건수입력용_무명') {
        pNames.add(a.이름);
      }
    });

    // 이 사업의 선택월 연인원 및 건수
    const progAtt = monthAtt.filter(a => a.사업ID === p.사업ID);
    let pCount = 0, pAccum = 0;
    
    if (isMemberType) {
      progAtt.forEach(a => {
        if (a.출석여부 === 'O') pAccum++;
      });

      // 일자별 건수 집계
      const pDaily = {};
      progAtt.forEach(a => {
        const dateStr = formatDateStr(a.날짜);
        if (!pDaily[dateStr]) pDaily[dateStr] = [];
        pDaily[dateStr].push(a);
      });

      Object.keys(pDaily).forEach(dateStr => {
        const records = pDaily[dateStr];
        let hasGroup = false;
        let indvCount = 0;
        records.forEach(a => {
          if (a.출석여부 === 'O') {
            const mType = memberMap[a.이름] || '개별';
            if (mType === '그룹') hasGroup = true;
            else indvCount++;
          }
        });
        pCount += (hasGroup ? 1 : 0) + indvCount;
      });
    } else {
      progAtt.forEach(a => {
        pCount += Number(a.건수) || 0;
      });
    }

    const gReal = Number(p.목표_실인원) || 0;
    const gCount = Number(p.목표_건수) || 0;
    const gAccum = Number(p.목표_연인원) || 0;

    return {
      팀명: p.팀명,
      사업명: p.사업명,
      실인원: isMemberType ? pNames.size : 0,
      건수: pCount,
      연인원: isMemberType ? pAccum : 0,
      '목표대비_실인원': gReal > 0 ? Math.round((pNames.size / gReal) * 100) : 0,
      '목표대비_건수': gCount > 0 ? Math.round((pCount / gCount) * 100) : 0,
      '목표대비_연인원': gAccum > 0 ? Math.round((pAccum / gAccum) * 100) : 0
    };
  });

  return {
    totalRealCount: grandReal.size,
    totalItemCount: grandCount,
    totalAccumCount: grandAccum,
    avgAchieveRate: avgRate,
    teamStats: teamStats,
    programs: programStats
  };
}

function getPersonalStats(staffId, year, month) {
  const staff = getSheetDataAsJSON('직원_마스터').find(s => s.직원ID === staffId);
  const progIds = staff ? (staff.담당사업IDs || '').split(',').map(id => id.trim()).filter(Boolean) : [];
  const progs = getSheetDataAsJSON('사업_마스터').filter(p => progIds.includes(p.사업ID));
  
  return {
    programs: progs
  };
}

// ==============================================================================
// 캐시 처리 (CacheService)
// ==============================================================================

function getCacheVersion() {
  const props = PropertiesService.getScriptProperties();
  let v = props.getProperty('DATA_VERSION');
  if (!v) {
    v = Date.now().toString();
    props.setProperty('DATA_VERSION', v);
  }
  return v;
}

function invalidateCache() {
  PropertiesService.getScriptProperties().setProperty('DATA_VERSION', Date.now().toString());
}

function putCacheChunked(cacheKey, str) {
  try {
    const cache = CacheService.getScriptCache();
    const chunkSize = 90000;
    const chunks = Math.ceil(str.length / chunkSize);
    const keys = [];
    for (let i = 0; i < chunks; i++) {
      const chunkKey = cacheKey + '_c' + i;
      cache.put(chunkKey, str.substring(i * chunkSize, (i + 1) * chunkSize), 600); // 10 minutes
      keys.push(chunkKey);
    }
    cache.put(cacheKey + '_meta', JSON.stringify(keys), 600);
  } catch (e) {
    // CacheService limit errors or other errors should not break the app
  }
}

function getCacheChunked(cacheKey) {
  try {
    const cache = CacheService.getScriptCache();
    const metaStr = cache.get(cacheKey + '_meta');
    if (!metaStr) return null;
    const keys = JSON.parse(metaStr);
    const chunks = cache.getAll(keys);
    let str = '';
    for (const k of keys) {
      if (!chunks[k]) return null;
      str += chunks[k];
    }
    return str;
  } catch (e) {
    return null;
  }
}

// ==============================================================================
// 트리거 설정 (근본적인 캐시 동기화 오류 해결)
// ==============================================================================

// 이 함수를 Apps Script 에디터에서 한 번 실행하면 구글 시트에서 직접 행을 삭제/추가할 때 자동으로 캐시가 무효화됩니다.
function setupAutoSyncTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 기존 트리거 확인 및 삭제 (중복 생성 방지)
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onSpreadsheetChange') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 새 onChange 트리거 생성
  ScriptApp.newTrigger('onSpreadsheetChange')
    .forSpreadsheet(ss)
    .onChange()
    .create();
    
  return true;
}

function onSpreadsheetChange(e) {
  // 사용자가 시트에서 직접 행 삭제, 추가, 수정 등 구조적 변경을 가했을 때 캐시 무효화
  invalidateCache();
}