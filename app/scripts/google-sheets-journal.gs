/** 업무프로그램에서 선택한 날짜의 일지를 받습니다. 웹앱으로 배포해 사용하세요. */
const JOURNAL_SPREADSHEET_ID = '14JvE14POspz86Pzb1teoUZwX47uupfsCQsuStjIZZiY';
const JOURNAL_TEMPLATE_SHEET_ID = 155290385;
const JOURNAL_ID_HEADER = '__WORK_APP_TASK_ID__';
const JOURNAL_NOTE_START = '〔업무프로그램〕';
const JOURNAL_NOTE_END = '〔/업무프로그램〕';

function journalJSON(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function journalValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function journalText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

function journalValidateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 1 || tasks.length > 1000) throw new Error('등록할 업무는 1~1,000건이어야 합니다.');
  const ids = new Set();
  const categories = ['상세페이지', '프로모션/배너', '제품개발/지원', '운영/지원', '기타'];
  tasks.forEach(function(task) {
    if (!task || !journalText(task.id, 200) || !/^[A-Za-z0-9_-]+$/.test(task.id) || ids.has(task.id)
      || categories.indexOf(task.category) < 0 || !journalText(task.project, 2000)
      || !journalText(task.content, 40000) || !task.content.trim()
      || ['완료', '진행중', '대기'].indexOf(task.status) < 0 || !journalText(task.notes, 10000)) {
      throw new Error('업무 데이터 형식이 올바르지 않습니다.');
    }
    ids.add(task.id);
  });
}

// setValue/setValues는 '='로 시작하는 문자열을 수식으로 해석하므로 문자로 저장합니다.
function journalLiteral(value) {
  return /^\s*[=+\-@]/.test(value) ? "'" + value : value;
}

function journalMergedNotes(existing, appNotes) {
  const escapedStart = JOURNAL_NOTE_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedEnd = JOURNAL_NOTE_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const manual = String(existing || '').replace(new RegExp(escapedStart + '[\\s\\S]*?' + escapedEnd, 'g'), '').trim();
  return [manual, appNotes ? JOURNAL_NOTE_START + '\n' + appNotes + '\n' + JOURNAL_NOTE_END : ''].filter(Boolean).join('\n');
}

function journalCheckIDColumn(sheet) {
  const last = Math.max(sheet.getLastRow(), 4);
  const values = sheet.getRange(4, 7, last - 3, 1).getValues();
  const formulas = sheet.getRange(4, 7, last - 3, 1).getFormulas();
  const header = values[0][0];
  if (header !== '' && header !== JOURNAL_ID_HEADER || formulas.some(function(row) { return row[0] !== ''; })
    || header !== JOURNAL_ID_HEADER && values.slice(1).some(function(row) { return row[0] !== ''; })) {
    throw new Error('G열에 기존 데이터가 있어 연결할 수 없습니다. 업무 ID를 저장할 G열을 비워주세요.');
  }
}

function journalCheckHeaders(sheet) {
  const expected = ['업무분류', '프로젝트명', '업무내용', '소요시간(h)', '진행상태', '비고'];
  const actual = sheet.getRange(4, 1, 1, 6).getValues()[0];
  if (actual.some(function(value, index) { return value !== expected[index]; })) {
    throw new Error('업무일지 탭의 A4:F4 항목이 원본 양식과 다릅니다. 양식을 확인해주세요.');
  }
}

function journalExistingDate(sheet) {
  const value = sheet.getRange('B2').getValue();
  if (value instanceof Date && !isNaN(value.getTime())) return Utilities.formatDate(value, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(value || '').trim();
}

function journalSync(spreadsheet, dateISO, tasks) {
  let sheet = spreadsheet.getSheetByName(dateISO);
  let createdSheet = false;
  if (!sheet) {
    const template = spreadsheet.getSheets().filter(function(candidate) { return candidate.getSheetId() === JOURNAL_TEMPLATE_SHEET_ID; })[0];
    if (!template) throw new Error('업무일지 원본 양식 탭을 찾을 수 없습니다.');
    journalCheckHeaders(template);
    journalCheckIDColumn(template);
    sheet = template.copyTo(spreadsheet).setName(dateISO);
    createdSheet = true;
    sheet.getRange(5, 1, sheet.getMaxRows() - 4, 7).clearContent();
    sheet.getRange(5, 1, sheet.getMaxRows() - 4, 6).clearNote();
  } else {
    journalCheckHeaders(sheet);
    journalCheckIDColumn(sheet);
    const existingDate = journalExistingDate(sheet);
    if (existingDate && existingDate !== dateISO) throw new Error('선택한 탭의 작성일자가 다릅니다. B2 날짜를 확인해주세요.');
  }
  const last = Math.max(sheet.getLastRow(), 4);
  const rows = last >= 5 ? sheet.getRange(5, 1, last - 4, 7).getValues() : [];
  const formulas = last >= 5 ? sheet.getRange(5, 1, last - 4, 7).getFormulas() : [];
  const byId = new Map();
  let appendRow = 5;
  rows.forEach(function(row, index) {
    if (row.some(function(value) { return value !== ''; }) || formulas[index].some(function(value) { return value !== ''; })) appendRow = index + 6;
    if (row[6] !== '') {
      const id = String(row[6]);
      if (byId.has(id)) throw new Error('같은 업무 ID가 시트에 두 번 있습니다. 중복 행을 확인해주세요.');
      byId.set(id, index + 5);
    }
  });
  // 모든 요청 및 기존 데이터 검증을 끝낸 뒤에만 실제 업무 값을 씁니다.
  const requiredRows = appendRow + tasks.filter(function(task) { return !byId.has(task.id); }).length - 1;
  if (requiredRows > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), requiredRows - sheet.getMaxRows());
  // 중간에 응답이 끊겨도 재시도 시 이미 기록한 업무 ID와 날짜를 인식할 수 있게 먼저 설정합니다.
  sheet.getRange('B2').setValue(new Date(dateISO + 'T00:00:00+09:00')).setNumberFormat('yyyy-mm-dd');
  sheet.getRange('G4').setValue(JOURNAL_ID_HEADER);
  sheet.hideColumns(7);
  let created = 0;
  let updated = 0;
  tasks.forEach(function(task) {
    let row = byId.get(task.id);
    if (row === undefined) {
      row = appendRow++;
      // 원본의 셀 값은 복사하지 않고 서식과 드롭다운 검증만 가져옵니다.
      if (row !== 5) {
        sheet.getRange(5, 1, 1, 6).copyTo(sheet.getRange(row, 1, 1, 6), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        sheet.getRange(5, 1, 1, 6).copyTo(sheet.getRange(row, 1, 1, 6), SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
      }
      sheet.getRange(row, 7).setValue(task.id);
      byId.set(task.id, row);
      created++;
    } else updated++;
    sheet.getRange(row, 1, 1, 3).setValues([[task.category, journalLiteral(task.project), journalLiteral(task.content)]]);
    // D열 소요시간은 사용자가 입력한 값을 그대로 유지합니다.
    sheet.getRange(row, 5).setValue(task.status);
    const noteCell = sheet.getRange(row, 6);
    if (!noteCell.getFormula()) noteCell.setValue(journalLiteral(journalMergedNotes(noteCell.getValue(), task.notes)));
    sheet.getRange(row, 3).setWrap(true);
  });
  SpreadsheetApp.flush();
  return { ok: true, dateISO: dateISO, created: created, updated: updated, createdSheet: createdSheet,
    url: spreadsheet.getUrl() + '#gid=' + sheet.getSheetId() };
}

function doPost(event) {
  let lock;
  try {
    if (!event || !event.postData || typeof event.postData.contents !== 'string' || event.postData.contents.length > 2000000) throw new Error('요청 데이터가 올바르지 않습니다.');
    let request;
    try { request = JSON.parse(event.postData.contents); } catch (_) { throw new Error('요청 데이터가 올바르지 않습니다.'); }
    const token = PropertiesService.getScriptProperties().getProperty('JOURNAL_SYNC_TOKEN');
    if (!token || token.length < 32 || !request || request.token !== token) throw new Error('연결 키가 일치하지 않습니다. 연결 설정을 확인해주세요.');
    if (request.action === 'ping') {
      const spreadsheet = SpreadsheetApp.openById(JOURNAL_SPREADSHEET_ID);
      return journalJSON({ ok: true, spreadsheetId: spreadsheet.getId(), protocolVersion: 2, reconcileJournalRows: true });
    }
    if (!journalValidDate(request.dateISO)) throw new Error('업무일지 날짜가 올바르지 않습니다.');
    if (request.action === 'syncJournalRows') {
      if (request.protocolVersion !== 2) throw new Error('최신 연결 코드를 사용해주세요.');
      journalValidateRows(request.rows, request.dateISO);
    } else journalValidateTasks(request.tasks);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(25000)) throw new Error('다른 등록을 처리 중입니다. 잠시 후 다시 눌러주세요.');
    if (request.action === 'syncJournalRows') return journalJSON(journalSyncRows(SpreadsheetApp.openById(JOURNAL_SPREADSHEET_ID), request.dateISO, request.rows));
    return journalJSON(journalSync(SpreadsheetApp.openById(JOURNAL_SPREADSHEET_ID), request.dateISO, request.tasks));
  } catch (error) {
    return journalJSON({ ok: false, error: String(error && error.message || '업무일지를 저장하지 못했습니다.').slice(0, 500) });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

const JOURNAL_FULL_SHEET_NAME = '박지은 대리';
const JOURNAL_FULL_HEADERS = ['작성자', '일자', '업무분류', '프로젝트명', '업무·처리내용', '요청 납기일', '실제 완료일', '소요시간(h)', '진행상태', '작업구분', '비고(특이사항)', '결과물 폴더 위치 / 파일명'];
const JOURNAL_FULL_KEY_HEADER = '__WORK_APP_DATE_TASK_KEY__';
function journalValidateRows(rows, dateISO) {
  if (!Array.isArray(rows) || rows.length > 1000) throw new Error('동기화할 업무는 0~1,000건이어야 합니다.');
  const ids = new Set();
  rows.forEach(function(row) {
    if (!row || !journalText(row.taskId, 200) || !/^[A-Za-z0-9_-]+$/.test(row.taskId) || ids.has(row.taskId) || !Array.isArray(row.values) || row.values.length !== 12 || row.values[1] !== dateISO) throw new Error('날짜와 업무 ID 또는 12열 데이터를 확인해주세요.');
    row.values.forEach(function(value, index) {
      if (index === 7) { if (value !== '' && (typeof value !== 'number' || !isFinite(value) || value < 0 || value > 24)) throw new Error('소요시간은 0~24시간이어야 합니다.'); }
      else if (!journalText(value, index === 4 ? 40000 : index === 11 ? 4000 : 10000)) throw new Error('일지 입력값을 확인해주세요.');
    });
    ids.add(row.taskId);
  });
}
function journalSyncRows(spreadsheet, dateISO, rows) {
  journalValidateRows(rows, dateISO);
  const headerRow = 2, keyColumn = 27;
  const sheet = spreadsheet.getSheets().filter(function(candidate) { return candidate.getSheetId() === 44908072; })[0];
  if (!sheet) throw new Error('연결할 일일 업무일지 탭을 찾을 수 없습니다.');
  const headers = sheet.getRange(headerRow,1,1,12).getValues()[0];
  if (headers.some(function(value,index) { return value !== JOURNAL_FULL_HEADERS[index]; }) || sheet.getRange(headerRow,1,1,12).getFormulas()[0].some(Boolean)) throw new Error('일일 업무일지의 A2:L2 항목을 확인해주세요.');
  const hasKeyColumn = sheet.getMaxColumns() >= keyColumn;
  const keyHeader = hasKeyColumn ? sheet.getRange(headerRow,keyColumn).getValue() : '';
  if (keyHeader !== '' && keyHeader !== JOURNAL_FULL_KEY_HEADER) throw new Error('AA열에 기존 데이터가 있습니다. 관리 키 열을 확인해주세요.');
  const last = Math.max(sheet.getLastRow(),headerRow);
  const values = last > headerRow ? sheet.getRange(headerRow+1,1,last-headerRow,12).getValues() : [];
  const keys = hasKeyColumn && last > headerRow ? sheet.getRange(headerRow+1,keyColumn,last-headerRow,1).getValues() : [];
  const keyFormulas = hasKeyColumn ? sheet.getRange(headerRow,keyColumn,last-headerRow+1,1).getFormulas() : [];
  if (keyFormulas.some(function(row) { return row[0] !== ''; })) throw new Error('AA열 관리 키에 수식이 있습니다.');
  const byKey = new Map();
  keys.forEach(function(row,index) {
    if (row[0] === '') return;
    const key = String(row[0]);
    const valueDate = values[index][1] instanceof Date ? Utilities.formatDate(values[index][1], 'Asia/Seoul', 'yyyy-MM-dd') : String(values[index][1]);
    if (keyHeader !== JOURNAL_FULL_KEY_HEADER || !/^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9_-]{1,200}$/.test(key) || (key.split('|')[0] !== valueDate && !values[index].every(function(value) { return value === ''; })) || byKey.has(key)) throw new Error('시트의 날짜 또는 중복 관리 키를 확인해주세요.');
    byKey.set(key,index + headerRow + 1);
  });
  // 서식/드롭다운만 있는 빈 양식 행은 위에서부터 채운다. 수기 값·수식·참고 내용은 보존한다.
  const scan = last > headerRow ? sheet.getRange(headerRow+1,1,last-headerRow,26).getValues() : [];
  const scanFormulas = last > headerRow ? sheet.getRange(headerRow+1,1,last-headerRow,26).getFormulas() : [];
  const freeRows = [];
  const incomingAuthors = new Set(rows.map(function(row) { return row.values[0]; }));
  scan.forEach(function(row,index) {
    const reserved = keys[index] && keys[index][0] !== '';
    const empty = row.every(function(value) { return value === ''; });
    const authorOnlyTemplate = incomingAuthors.has(row[0]) && row.slice(1).every(function(value) { return value === ''; });
    if (!reserved && (empty || authorOnlyTemplate) && scanFormulas[index].every(function(value) { return value === ''; })) freeRows.push(index+headerRow+1);
  });
  let append = last+1, created = 0, updated = 0;
  const newCount = rows.filter(function(row) { return !byKey.has(dateISO + '|' + row.taskId); }).length;
  const required = append + Math.max(0,newCount-freeRows.length) - 1;
  if (required > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),required-sheet.getMaxRows());
  if (!hasKeyColumn) sheet.insertColumnsAfter(sheet.getMaxColumns(),keyColumn-sheet.getMaxColumns());
  sheet.getRange(headerRow,keyColumn).setValue(JOURNAL_FULL_KEY_HEADER);
  sheet.hideColumns(keyColumn);
  rows.forEach(function(item) {
    const key = dateISO + '|' + item.taskId;
    let row = byKey.get(key);
    if (row === undefined) {
      row = freeRows.length ? freeRows.shift() : append++; byKey.set(key,row); created++;
      sheet.getRange(headerRow+1,1,1,12).copyTo(sheet.getRange(row,1,1,12),SpreadsheetApp.CopyPasteType.PASTE_FORMAT,false);
      sheet.getRange(headerRow+1,1,1,12).copyTo(sheet.getRange(row,1,1,12),SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION,false);
    } else updated++;
    // 관리 키를 먼저 확보해 재시도 시 같은 행을 갱신한다.
    sheet.getRange(row,keyColumn).setValue(key);
    const data = item.values.map(function(value) { return typeof value === 'string' ? journalLiteral(value) : value; });
    sheet.getRange(row,1,1,12).setValues([data]).setWrap(true);
    sheet.getRange(row,8).setNumberFormat('0.0########');
  });
  // Reconcile only app-managed rows for this date; preserve manual rows and M:Z.
  const incoming = new Set(rows.map(function(item) { return dateISO + '|' + item.taskId; }));
  let removed = 0;
  byKey.forEach(function(row, key) {
    if (key.split('|')[0] !== dateISO || incoming.has(key)) return;
    sheet.getRange(row,1,1,12).clearContent();
    sheet.getRange(row,keyColumn).clearContent();
    removed++;
  });
  SpreadsheetApp.flush();
  return { ok: true, protocolVersion: 2, removed: removed, dateISO: dateISO, created: created, updated: updated, url: spreadsheet.getUrl() + '#gid=' + sheet.getSheetId() };
}
