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
    const bypassActions = ['login', 'register', 'verifyQRToken', 'selfCheckIn'];
    if (!bypassActions.includes(action)) {
      if (!payload.token) throw new Error('인증 토큰이 필요합니다.');
      user = verifyToken(payload.token);
      if (!user) throw new Error('유효하지 않거나 만료된 토큰입니다.');
    }

    switch (action) {
      case 'login': result = login(payload.team, payload.name, payload.password); break;
      case 'register': result = registerUser(payload.team, payload.name, payload.password, payload.role); break;
      
      // 회원 관리
      case 'getMembers': result = getMembers(payload.programId, payload.status); break;
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
    case '사업_마스터': return ['팀명', '사업분류', '세부사업분류', '사업명', '실적유형', '상태', '목표_건수', '목표_실인원', '목표_연인원', '담당자', '사업ID'];
    case '회원_마스터': return ['이름', '시작일', '상태', '장애비장애구분', '메모'];
    case '출석_원장': return ['출석ID', '날짜', '사업ID', '사업명', '팀명', '이름', '출석여부', '건수', '입력방식', '입력자', '입력시각'];
    case '실적_집계': return ['팀명', '사업명', '년도', '월', '실인원', '건수', '연인원', '목표대비_실인원(%)', '목표대비_건수(%)', '목표대비_연인원(%)'];
    default: return [];
  }
}

function getSheetDataAsJSON(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  
  const expectedHeaders = getHeadersForSheet(sheetName);
  const currentHeaders = data[0].map(h => String(h).trim());
  
  const hasValidHeaders = expectedHeaders.length > 0 && currentHeaders[0] === expectedHeaders[0];
  
  if (!hasValidHeaders) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]).setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
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
    data.상태 || '활성', data.목표_건수 || 0, data.목표_실인원 || 0, data.목표_연인원 || 0,
    data.담당자 || '', programId
  ]);
  return { programId };
}

function updateProgram(programId, data) {
  const sheet = getSheet('사업_마스터');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][10] === programId) {
      sheet.getRange(i + 1, 1, 1, 10).setValues([[
        data.팀명, data.사업분류, data.세부사업분류, data.사업명, data.실적유형,
        data.상태, data.목표_건수, data.목표_실인원, data.목표_연인원, data.담당자
      ]]);
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
      row.상태 || '활성', row.목표_건수 || 0, row.목표_실인원 || 0, row.목표_연인원 || 0,
      row.담당자 || '', 'PROG_' + Math.floor(Math.random()*10000000)
    ]);
  });
  return true;
}

// ==============================================================================
// 회원 관리
// ==============================================================================

function getMembers(programId, status) {
  let members = getSheetDataAsJSON('회원_마스터');
  if (status && status !== 'all') {
    members = members.filter(m => m.상태 === status);
  }
  // 특정 사업에 종속된 회원을 거를 경우 필터링 추가 가능 (현재는 전체 회원 풀 공유)
  return members;
}

function addMember(data) {
  const sheet = getSheet('회원_마스터');
  sheet.appendRow([
    data.이름, data.시작일, data.상태 || '활성', data.장애비장애구분 || '비장애', data.메모 || ''
  ]);
  return true;
}

function updateMember(name, data) {
  const sheet = getSheet('회원_마스터');
  const vals = sheet.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][0] === name) {
      sheet.getRange(i + 1, 1, 1, 5).setValues([[
        data.이름, data.시작일, data.상태, data.장애비장애구분, data.메모
      ]]);
      return true;
    }
  }
  throw new Error('해당 회원을 찾을 수 없습니다.');
}

function importMembersCSV(csvData) {
  const sheet = getSheet('회원_마스터');
  csvData.forEach(row => {
    sheet.appendRow([
      row.이름, row.시작일, row.상태 || '활성', row.장애비장애구분, row.메모 || ''
    ]);
  });
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
  return true;
}

function deleteExistingAttendance(programId, date) {
  const sheet = getSheet('출석_원장');
  const vals = sheet.getDataRange().getValues();
  for (let i = vals.length - 1; i >= 1; i--) {
    if (vals[i][2] === programId && formatDateStr(vals[i][1]) === date) {
      sheet.deleteRow(i + 1);
    }
  }
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
    'O', 0, 'QR', name, new Date()
  ]);
  
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
  // 실제로는 실적_집계 시트를 쿼리하지만, 예시로 임의의 로직 반환
  const progs = getSheetDataAsJSON('사업_마스터').filter(p => p.팀명 === teamName);
  
  // 출석 데이터 분석 로직 생략 (간소화)
  return {
    real: 150,
    accum: 1200,
    count: 45,
    rate: 85,
    programs: progs.map(p => ({
      팀명: p.팀명,
      사업명: p.사업명,
      실인원: Math.floor(Math.random() * 50),
      건수: Math.floor(Math.random() * 10),
      연인원: Math.floor(Math.random() * 200),
      목표대비_실인원: Math.floor(Math.random() * 40 + 80),
      목표대비_건수: Math.floor(Math.random() * 40 + 80),
      목표대비_연인원: Math.floor(Math.random() * 40 + 80)
    }))
  };
}

function getAllStats(year, month) {
  const teams = ['지역연계팀', '맞춤지원팀', '건강문화팀', '성장지원팀', '전략기획팀', '미래경영팀'];
  const teamStats = teams.map(t => ({ team: t, rate: Math.floor(Math.random() * 40 + 60) }));
  
  const progs = getSheetDataAsJSON('사업_마스터');
  
  return {
    totalRealCount: 1240,
    totalItemCount: 342,
    totalAccumCount: 8900,
    avgAchieveRate: 91,
    teamStats: teamStats,
    programs: progs.map(p => ({
      팀명: p.팀명,
      사업명: p.사업명,
      실인원: Math.floor(Math.random() * 50),
      건수: Math.floor(Math.random() * 10),
      연인원: Math.floor(Math.random() * 200),
      목표대비_실인원: Math.floor(Math.random() * 40 + 80),
      목표대비_건수: Math.floor(Math.random() * 40 + 80),
      목표대비_연인원: Math.floor(Math.random() * 40 + 80)
    }))
  };
}

function getPersonalStats(staffId, year, month) {
  const staff = getSheetDataAsJSON('직원_마스터').find(s => s.직원ID === staffId);
  const progIds = staff ? (staff.담당사업IDs || '').split(',') : [];
  const progs = getSheetDataAsJSON('사업_마스터').filter(p => progIds.includes(p.사업ID));
  
  return {
    programs: progs
  };
}