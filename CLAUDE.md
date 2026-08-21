# 迴圈生存者 loop-survivors

教學用 2D 網頁彈幕遊戲。學生用 Scratch 風格積木撰寫攻擊腳本，在 Vampire
Survivors 式的戰場中，被遊戲規則逼著自己發現迴圈的價值。

**設計決策與理由全部記在 `docs/DECISIONS.md`。動手改任何設計前先讀那份文件。**
原則是定案不翻案——要推翻某條，必須先確認它的理由已不成立。

## 目前進度

M3 進行中。已完成：M1 全部、M2 全部（經驗球、升等三選一、稀有積木、
容量與屬性升級），以及 M3 的階段輪替、三種敵人結構弱點、王與階段預告。
尚未做：腳本槽位、結算畫面、本機排行榜、分享碼、音效。

已規劃未實作（2026-08-21）：護盾兵與疾行群（DECISIONS.md §9a 敵人表）、
飛行箭矢與正 n 邊形（§9b）。

**本作的核心賣點是「依敵人種類重新排列積木」（DECISIONS.md §9a）** ——
任何改動若讓某一種排列在所有階段通吃，就是傷到根本，必須先擋下來。

**遊戲是無盡模式**（§9 改版）：階段循環、王每輪出現一次、敵人無上限變強，
成績是存活時間。第一輪循環的難度屬於**教學設施而非遊戲平衡** ——
撐不到第一隻王的學生就看不到核心賣點，這條不能為了難度感犧牲。
里程碑定義見 DECISIONS.md §13。

## 技術棧

vanilla TypeScript + Vite ｜ 原生 Canvas 2D ｜ Blockly 13（zelos renderer）

**刻意不用 React**，理由見 DECISIONS.md §11。不要「順手」引入框架。

## 架構

```
src/
  config/            設定，依領域分檔（調平衡先來這裡）
    runtime.ts         執行引擎參數（通常不該動）
    combat.ts          戰鬥數值 —— 平衡調整的主戰場
    enemies.ts         敵人原型與階段輪替
    progress.ts        經驗與升級曲線
    shield.ts          幾何護盾
    ui.ts              介面參數
    index.ts           匯總出口（對外仍是 from "../config"）
  weapons/           **武器定義。新增武器只需要在這裡多一個檔案**
    types.ts           WeaponDef：積木清單、子彈基準、冷卻、容量、起手腳本
    basic.ts           基本射擊
    index.ts           登錄表
  script/
    ast.ts             積木 AST 型別（Blockly 的序列化目標）
    vm.ts              協程直譯器 ＋ 欠債式計時
    presets.ts         起手腳本
    format.ts          AST → 可顯示的行（監視器用）
  game/
    world.ts           世界模擬：階段、敵人、子彈、經驗、碰撞
    shield-unit.ts     **幾何護盾。獨立於武器的插件**
    shield.ts          護盾的幾何運算（海龜走訪、點到線段距離）
    types.ts           實體型別
    collision.ts       敵人的均勻網格
    input.ts           鍵盤輸入
  render/
    renderer.ts        Canvas 2D 繪製：純粹讀 World，不改狀態
    hud.ts             戰場 HUD
    monitor.ts         遊玩時左上角的腳本監視器（逐步執行顯示）
  blocks/
    definitions.ts     積木定義（**純資料，不依賴 Blockly**）
    defs.ts            註冊進 Blockly ＋ 語言字串 ＋ 深色主題
    toolbox.ts         依武器的積木清單生成工具箱
    serialize.ts       Blockly 工作區 → AST（只 import type）
    state.ts           AST → Blockly 序列化狀態（只 import type）
    hints.ts           積木上的代價提示
  editor.ts          Blockly 編輯器
  preview.ts         暫停時的試射預覽／護盾形狀預覽
  splitter.ts        面板拖曳與收合
  cards.ts / levelup.ts   升級卡與三選一介面
  main.ts            組裝與主迴圈
tools/
  sim.ts             無頭模擬器（平衡量測）
  verify-blocks.ts   積木序列化的無頭驗證
```

## 三個擴充點

### 新增一把武器

在 `src/weapons/` 加一個檔案，實作 `WeaponDef`，然後在 `index.ts` 的
`WEAPONS` 加一行。**其餘程式碼都不必改** —— World、VM、工具箱都只讀定義。

```ts
export const MY_WEAPON: WeaponDef = {
  id, name, description,
  blocks: [...],        // 這把武器能用哪些積木＝它能怎麼寫
  capacity, cooldown,
  bullet: { speed, size, pierce, life, damage, homing, explode, split },
  presets: [...],
};
```

設計約束（DECISIONS.md §9d）：每把武器都應該**逼出不同的積木排列**。
只是子彈更強、更快的武器不值得做 —— 換武器要換的是寫法，不是數字。
新積木要同時加進 `blocks/definitions.ts` 與 `toolbox.ts` 的 `GROUPS`。

### 新增一種敵人

在 `config/enemies.ts` 的 `ENEMY_KINDS` 加一個原型，再到 `PHASES` 安排它
出場。同樣的約束：新敵人要逼出的排列必須與既有的不同，否則只是多一種
血量不同的靶子。

### 調平衡

一律在 `config/` 底下，不要把數值寫進邏輯。改完跑 `npm run sim -- 300`
對照，特別確認**迴圈紅線**：巢狀迴圈的輸出必須明顯高於無迴圈的寫法。

### 為什麼 blocks/ 要拆這麼細

`definitions.ts`（純資料）、`serialize.ts`／`state.ts`（只 import type）都沒有
執行期的 Blockly 相依 —— 所以 `npm run verify` 能在 Node 裡完成「AST → 積木 →
讀回 AST」的來回驗證，不必啟動瀏覽器。這條路徑出錯時，瀏覽器裡的症狀是
「積木載不進來」或「拖了沒反應」，極難 debug；在 Node 裡則會直接指出
是哪張腳本、哪個欄位對不上。

### main.ts 的宣告順序（踩過兩次）

`main.ts` 是 top-level 直線執行，而 `let` 有 TDZ。只要有函式在變數宣告之前
被呼叫且讀到它，就會拋 ReferenceError —— 而它拋在模組初始化階段，
**rAF 迴圈根本不會開始，症狀是整頁空白卡死**，完全看不出跟宣告順序有關。

所有可變狀態集中宣告在 `main.ts` 檔案上方那一區，新增狀態一律加在那裡，
不要就近宣告。`npm run lint` 的 `no-use-before-define` 會擋下這類錯誤，
且已納入 `npm run build`。

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
npm run lint     # oxlint，主要防的是 no-use-before-define（見上方陷阱）
```

`tools/sim.ts` 是調平衡的主要工具，也是時間成本模型的迴歸測試：
若「預測週期」與「實測週期」開始對不上，代表 VM 計時邏輯被改壞了。
改完 config.ts 的任何數值都該重跑一次。

部署為純靜態（GitHub Pages 或校內 NAS），無後端。
