# 迴圈生存者 loop-survivors

教學用 2D 網頁彈幕遊戲。學生用 Scratch 風格積木撰寫攻擊腳本，在 Vampire
Survivors 式的戰場中，被遊戲規則逼著自己發現迴圈的價值。

**設計決策與理由全部記在 `docs/DECISIONS.md`。動手改任何設計前先讀那份文件。**
原則是定案不翻案——要推翻某條，必須先確認它的理由已不成立。

## 目前進度

M1 進行中：Blockly 已接上，積木可拖、即時套用、積木高亮已接到真積木上。
尚未做：試射預覽視窗、本輪執行次數顯示。里程碑定義見 DECISIONS.md §13。

## 技術棧

vanilla TypeScript + Vite ｜ 原生 Canvas 2D ｜ Blockly 13（zelos renderer）

**刻意不用 React**，理由見 DECISIONS.md §11。不要「順手」引入框架。

## 架構

```
src/
  config.ts          所有可調常數集中在此（BLOCK_COST、MAX_BULLETS…）
  main.ts            進入點：組裝各模組、啟動迴圈
  script/
    ast.ts           積木 AST 型別定義（就是 Blockly 之後要序列化成的格式）
    vm.ts            協程直譯器：generator，yield 出「本步要消耗的秒數」
    presets.ts       手寫測試腳本（M1 後成為角色卡的起手腳本）
  game/
    types.ts         實體型別
    world.ts         世界狀態容器 + 每步更新
    spawn.ts         敵人生成
    collision.ts     碰撞判定
  render/
    renderer.ts      Canvas 2D 繪製：純粹讀 World 畫出來，不改狀態
    hud.ts           戰場側 HUD（積木面板已由 editor.ts 接手）
  editor.ts          Blockly 編輯器：載入／讀出腳本、積木高亮
  blocks/
    definitions.ts   八塊積木的定義（**純資料，不依賴 Blockly**）
    defs.ts          把定義註冊進 Blockly ＋ 深色主題
    toolbox.ts       工具箱＝學生能用的積木清單
    serialize.ts     Blockly 工作區 → AST（只 import type）
    state.ts         AST → Blockly 序列化狀態（只 import type）
tools/
  sim.ts             無頭模擬器（不進建置產物）
  verify-blocks.ts   積木序列化的無頭驗證
```

### 為什麼 blocks/ 要拆這麼細

`definitions.ts`（純資料）、`serialize.ts`／`state.ts`（只 import type）都沒有
執行期的 Blockly 相依 —— 所以 `npm run verify` 能在 Node 裡完成「AST → 積木 →
讀回 AST」的來回驗證，不必啟動瀏覽器。這條路徑出錯時，瀏覽器裡的症狀是
「積木載不進來」或「拖了沒反應」，極難 debug；在 Node 裡則會直接指出
是哪張腳本、哪個欄位對不上。

### Blockly 的陷阱（踩過一次，別再踩）

**`blockly/core` 不含任何語言字串**，必須自己 `setLocale()`，而且要在 `inject()`
之前。少了它，`inject()` 會在建立無障礙標籤時對 `undefined` 呼叫 `.replace`
而拋例外 —— 這發生在模組初始化階段，rAF 迴圈根本沒開始，**症狀是整頁空白卡死，
而且看起來完全不像跟語言有關**。設定在 `blocks/defs.ts` 最上方。

無頭測試（`npm run verify`）抓不到這類錯誤，因為它不呼叫 `inject()`。
瀏覽器端的錯誤會被 Vite 轉發到 dev server 的輸出，卡死時先去那裡看堆疊。

### Blockly 的三層限制（全部原生支援，不需自製積木 UI）

| 需求 | API |
|---|---|
| 只能用特定積木 | 工具箱定義；`updateToolbox()` 動態解鎖 |
| 容量上限 | `maxBlocks`（＝capacity+1，根積木不佔格）＋ `remainingCapacity()` |
| 迴圈次數上限 | 數字欄位的 min/max，輸入當下就擋掉 |
| 稀有積木限量 | `maxInstances`；達上限時 `isDuplicatable()` 自動回傳 false |

### 三條架構鐵律

1. **VM 與 renderer 必須可獨立呼叫**。M1 的試射預覽視窗要在沒有敵人的簡化場景
   中跑同一個 VM 和同一套繪製。事後補這個抽象會很痛。

2. **renderer 只讀不寫**。所有狀態變更都在 `world.step()` 裡發生。
   這是「換掉渲染層不必動遊戲邏輯」的前提。

3. **VM 不直接碰 World**。VM 透過 `ScriptHost` 介面發射子彈、查詢最近敵人。
   預覽視窗會傳入一個假的 host——這是預覽能重用 VM 的關鍵。

### 時間模型

固定步長 `STEP = 1/60`，accumulator 模式。VM 的時間是**腳本時間**，與遊戲時間
同步推進但獨立計費：每塊積木耗 `BLOCK_COST`（4ms），`等待` 耗其參數秒數。

一幀 16.67ms ÷ 4ms ≈ 每幀執行約 4 塊積木。這個比例是遊戲手感的核心，改
`BLOCK_COST` 前先讀 DECISIONS.md §3 的成本曲線表。

## 慣例

- 所有可調數值放 `config.ts`，不要散落在各模組
- 角度統一用**度**（積木面向學生），只在三角函式呼叫前轉弧度
- 座標系：世界座標以玩家出生點為原點，Y 軸向下（Canvas 慣例）
- 註解寫「為什麼」，不寫「做什麼」

## 開發

```bash
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build，產出純靜態檔
npm run sim      # 無頭模擬，量測各腳本的實際輸出（npm run sim -- 30 可指定秒數）
npm run verify   # 無頭驗證積木序列化來回轉換
```

`tools/sim.ts` 是調平衡的主要工具，也是時間成本模型的迴歸測試：
若「預測週期」與「實測週期」開始對不上，代表 VM 計時邏輯被改壞了。
改完 config.ts 的任何數值都該重跑一次。

部署為純靜態（GitHub Pages 或校內 NAS），無後端。
