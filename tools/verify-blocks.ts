/**
 * 積木序列化的無頭驗證 —— 不開瀏覽器就能確認 Blockly 這一層沒壞。
 *
 *   npm run verify
 *
 * 驗什麼：AST → Blockly 積木 → 讀回 AST，結構必須完全一致。
 * 這條路徑上任何一環出錯（欄位名打錯、狀態格式不合、積木型別漏接），
 * 在瀏覽器裡的症狀都是「積木載不進來」或「拖了沒反應」，很難debug。
 * 在這裡則會直接指出是哪一張腳本、哪個欄位對不上。
 *
 * 之所以能無頭執行：serialize.ts 與 state.ts 只 import type，
 * 執行期沒有任何 Blockly 相依；積木定義也拆成了純資料 definitions.ts。
 */
import * as BlocklyNS from "blockly/core";
import { BLOCK_DEFS } from "../src/blocks/definitions";
import { scriptToState } from "../src/blocks/state";
import { workspaceToScript } from "../src/blocks/serialize";
import { PRESETS } from "../src/script/presets";
import { countBlocks, type Node } from "../src/script/ast";

// Node 走 blockly 的 "node" 匯出條件，拿到的是 CJS 命名空間，
// 真正的內容包在 default 底下；瀏覽器端則是直接的 ESM 命名空間
const Blockly = ((BlocklyNS as unknown as { default?: typeof BlocklyNS }).default ??
  BlocklyNS) as typeof BlocklyNS;

Blockly.defineBlocksWithJsonArray(BLOCK_DEFS);

/** 比對結構與參數；id 不比對，因為 Blockly 會重新配發 */
function same(a: Node[], b: Node[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    if (x.kind !== y.kind) return false;
    if (x.kind === "repeat" && y.kind === "repeat") {
      return x.times === y.times && same(x.body, y.body);
    }
    return JSON.stringify({ ...x, id: "" }) === JSON.stringify({ ...y, id: "" });
  });
}

console.log("\n=== 積木序列化來回驗證 ===\n");
let allPass = true;

for (const preset of PRESETS) {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(scriptToState(preset), ws);
  const back = workspaceToScript(ws, preset.name, preset.capacity);
  const pass = same(preset.body, back.body);
  allPass &&= pass;

  // 根積木不佔學生的容量，所以 maxBlocks 要設 capacity + 1
  const blocks = ws.getAllBlocks(false).length;
  console.log(
    `  ${pass ? "✅" : "❌"} ${preset.name.padEnd(5)}` +
    `　${countBlocks(preset.body)} 格 → ${blocks} 塊積木（含根）→ 讀回 ${countBlocks(back.body)} 格` +
    `　maxBlocks=${preset.capacity + 1}`,
  );
  if (!pass) {
    console.log("     原始：", JSON.stringify(preset.body));
    console.log("     讀回：", JSON.stringify(back.body));
  }
  ws.dispose();
}

// 積木高亮的前提：VM 回報的 id 必須能直接找回 Blockly 積木
const ws = new Blockly.Workspace();
Blockly.serialization.workspaces.load(scriptToState(PRESETS[3]), ws);
const script = workspaceToScript(ws, "巢狀", 16);
const found = script.body.length > 0 && ws.getBlockById(script.body[0].id) !== null;
allPass &&= found;
console.log(`\n  ${found ? "✅" : "❌"} AST 的 id 能用 getBlockById() 找回積木（積木高亮的前提）`);

// 停用的積木不該進入腳本
const disabled = ws.getAllBlocks(false).find((b) => b.type === "ls_fire");
if (disabled) {
  disabled.setDisabledReason(true, "test");
  const after = workspaceToScript(ws, "巢狀", 16);
  const dropped = countBlocks(after.body) < countBlocks(script.body);
  allPass &&= dropped;
  console.log(`  ${dropped ? "✅" : "❌"} 停用的積木不會被序列化進腳本（學生可暫時關掉一段來對照）`);
}
ws.dispose();

console.log(allPass ? "\n全部通過\n" : "\n有失敗項目\n");
if (!allPass) process.exit(1);
