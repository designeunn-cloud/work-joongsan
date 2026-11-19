import chokidar from "chokidar";
import path from "node:path";

export function watchExcelInbox(folder: string, onFile: (filePath: string) => void) {
  const root = path.resolve(folder);
  return chokidar.watch(root, {
    depth: 0,
    ignoreInitial: false,
    ignored: (candidate, stats) => {
      const name = path.relative(root, candidate);
      if (!name) return false;
      return path.dirname(name) !== "." || name.startsWith("~$") || !/\.(xlsx|xls|xlsm)$/i.test(name)
        || Boolean(stats && !stats.isFile());
    },
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
  })
    .on("error", error => console.error("[watcher] 폴더 감시 오류:", error))
    .on("add", onFile);
}
