import fs from "node:fs";
import path from "node:path";

type OutputNoteTask = {
  status: string;
  folderPath: string;
  sourceFileName?: string | null;
  requestContent: string;
  outputLocation?: string | null;
};
export type TaskOutputNote = { path: string; content: string; root: string };
export class TaskOutputNoteError extends Error {
  constructor(cause: unknown) {
    super("결과물 위치 TXT를 저장하지 못해 완료 처리를 취소했습니다. 업무 폴더와 쓰기 권한을 확인해주세요.", { cause });
    this.name = "TaskOutputNoteError";
  }
}

function within(root: string, candidate: string) {
  const relative = path.relative(root, candidate);
  return !!relative && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
function checkFolder(root: string, folder: string) {
  if (!within(root, folder) || !within(fs.realpathSync(root), fs.realpathSync(folder))) {
    throw new Error("업무 폴더가 작업 폴더 범위 밖에 있습니다.");
  }
  for (let current = folder; path.relative(root, current); current = path.dirname(current)) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error("링크 폴더에는 결과물 위치를 기록할 수 없습니다.");
  }
}
function hasWorkFiles(folder: string, sourceFileName: string): boolean {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (hasWorkFiles(path.join(folder, entry.name), "")) return true;
    } else if (!entry.isFile()) {
      throw new Error("내용을 확인할 수 없는 항목이 있습니다.");
    } else if (!/\.txt$/i.test(entry.name) && !["desktop.ini", "thumbs.db"].includes(entry.name.toLowerCase())
      && entry.name.toLowerCase() !== sourceFileName.toLowerCase()) return true;
  }
  return false;
}

/** 원본 엑셀과 참고 텍스트만 있는 업무는 완료 즉시 결과물 위치를 함께 보관한다. */
export function createTaskOutputNote(task: OutputNoteTask): TaskOutputNote | null {
  const requestFile = task.sourceFileName?.split(/[\\/]/).pop() ?? "";
  if (task.status !== "done" || !task.outputLocation?.trim() || !/\.xls[xm]?$/i.test(requestFile)) return null;
  try {
    const configuredRoot = process.env.WATCH_FOLDER_PATH;
    if (!configuredRoot) throw new Error("작업 폴더 설정이 없습니다.");
    const root = path.resolve(configuredRoot), folder = path.resolve(task.folderPath);
    checkFolder(root, folder);
    const requestPath = path.join(folder, requestFile);
    if (!fs.existsSync(requestPath) || !fs.lstatSync(requestPath).isFile() || hasWorkFiles(folder, requestFile)) return null;
    const content = `\uFEFF업무명: ${task.requestContent}\r\n\r\n결과물 위치:\r\n${task.outputLocation}\r\n`;
    for (let index = 1; index <= 1000; index++) {
      const filePath = path.join(folder, index === 1 ? "결과물 위치.txt" : `결과물 위치 (${index}).txt`);
      let descriptor: number;
      try { descriptor = fs.openSync(filePath, "wx"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (fs.lstatSync(filePath).isFile() && fs.readFileSync(filePath, "utf8") === content) return null;
        continue;
      }
      try {
        try { fs.writeFileSync(descriptor, content, "utf8"); }
        finally { fs.closeSync(descriptor); }
      } catch (error) {
        fs.unlinkSync(filePath);
        throw error;
      }
      return { path: filePath, content, root };
    }
    throw new Error("결과물 위치 TXT의 빈 파일명을 찾지 못했습니다.");
  } catch (error) { throw new TaskOutputNoteError(error); }
}

/** 완료 DB 저장 실패 시 이번 요청에서 새로 만든 TXT만 제거한다. */
export function rollbackTaskOutputNote(note: TaskOutputNote) {
  if (!fs.existsSync(note.path)) return;
  checkFolder(note.root, path.dirname(note.path));
  if (!fs.lstatSync(note.path).isFile() || fs.readFileSync(note.path, "utf8") !== note.content) {
    throw new Error("결과물 위치 TXT가 변경되어 자동으로 제거하지 않았습니다.");
  }
  fs.unlinkSync(note.path);
}
