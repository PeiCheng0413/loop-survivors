import { REPEAT_LIMIT } from "../config";

/**
 * 八塊基本積木的定義（見 docs/DECISIONS.md §5）—— 純資料，不依賴 Blockly。
 *
 * 之所以與註冊程式碼分開：這份資料可以在 Node 裡被無頭測試載入，
 * 用來驗證序列化來回轉換，不必啟動瀏覽器。
 *
 * 全部使用繁體中文標籤：認知負荷該留給迴圈概念，不該分給英文單字。
 *
 * 顏色沿用 Scratch 的分類慣例，讓學生的既有經驗可以遷移：
 * 控制＝橘、動作＝藍、狀態＝紫。
 */

const CONTROL = "#FFAB19";
const ACTION = "#4C97FF";
const STATE = "#9966FF";
/** 稀有積木用金色，跟一般積木一眼分得開 —— 它們是升級卡發的，數量有限 */
const RARE = "#FFB300";

export const BLOCK_DEFS = [
  {
    // 腳本的根。做成 hat 積木，學生一眼看得出「程式從這裡開始」
    type: "ls_start",
    message0: "攻擊腳本",
    message1: "%1",
    args1: [{ type: "input_statement", name: "DO" }],
    colour: "#FFBF00",
    hat: "cap",
    tooltip: "每個攻擊週期會從這裡開始執行一次",
  },
  {
    type: "ls_repeat",
    message0: "重複執行 %1 次",
    // 次數上限由 REPEAT_LIMIT 決定，Blockly 的數字欄位原生支援 min/max ——
    // 「重複 9999 次」在輸入的當下就被擋掉，不需要額外的檢查程式碼
    args0: [{ type: "field_number", name: "TIMES", value: 8, min: 1, max: REPEAT_LIMIT, precision: 1 }],
    message1: "%1",
    args1: [{ type: "input_statement", name: "DO" }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL,
    tooltip: "把裡面的積木重複執行指定次數",
  },
  {
    type: "ls_wait",
    // HINT 是動態標籤，由 editor.ts 依欄位值即時填入「下一發 ×2.6」
    message0: "等待 %1 秒 %2",
    args0: [
      { type: "field_number", name: "SECONDS", value: 0.1, min: 0, max: 3, precision: 0.05 },
      { type: "field_label", name: "HINT", text: "" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL,
    tooltip: "暫停這段時間再繼續執行。間隔越久，下一發子彈的傷害越高（蓄力）",
  },
  {
    type: "ls_fire",
    message0: "發射子彈",
    previousStatement: null,
    nextStatement: null,
    colour: ACTION,
    tooltip: "朝目前的方向射出一發子彈",
  },
  {
    type: "ls_turn",
    message0: "方向旋轉 %1 度",
    args0: [{ type: "field_number", name: "DEGREES", value: 45, min: -360, max: 360, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION,
    tooltip: "在目前方向上再轉一個角度",
  },
  {
    type: "ls_aim",
    message0: "方向設為 %1",
    args0: [
      {
        type: "field_dropdown",
        name: "TARGET",
        options: [
          ["最近的敵人", "nearest"],
          ["移動方向", "moveDir"],
          ["隨機", "random"],
        ],
      },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION,
    tooltip: "把方向直接設定到某個目標",
  },
  {
    type: "ls_set_speed",
    message0: "子彈速度設為 %1 %2",
    args0: [
      { type: "field_number", name: "VALUE", value: 420, min: 60, max: 1200, precision: 10 },
      { type: "field_label", name: "HINT", text: "" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "影響之後發射的子彈。速度越高，角色移動越慢",
  },
  {
    type: "ls_set_size",
    message0: "子彈大小設為 %1 %2",
    args0: [
      { type: "field_number", name: "VALUE", value: 4, min: 1, max: 16, precision: 1 },
      { type: "field_label", name: "HINT", text: "" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "影響之後發射的子彈。子彈越大，角色移動越慢",
  },
  {
    type: "ls_set_pierce",
    message0: "子彈穿透設為 %1 %2",
    args0: [
      { type: "field_number", name: "VALUE", value: 0, min: 0, max: 10, precision: 1 },
      { type: "field_label", name: "HINT", text: "" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "子彈打到敵人後還能穿過幾個。穿透越高，角色移動越慢",
  },
  {
    // 以下為稀有積木：不在起始工具箱裡，只能從升級卡取得，且拿幾個放幾個
    type: "ls_homing",
    message0: "子彈改為追蹤",
    previousStatement: null,
    nextStatement: null,
    colour: RARE,
    tooltip: "稀有積木。之後發射的子彈會轉向最近的敵人",
  },
  {
    type: "ls_explode",
    message0: "子彈改為爆裂",
    previousStatement: null,
    nextStatement: null,
    colour: RARE,
    tooltip: "稀有積木。之後發射的子彈命中時會炸開，波及周圍敵人",
  },
  {
    /**
     * 迴圈變數的輕量版。不引入完整的變數系統，但讓學生第一次能用到
     * 「現在是第幾圈」—— 而它畫出來就是螺旋。
     */
    type: "ls_turn_by_index",
    message0: "方向旋轉 %1 度 × 迴圈次數",
    args0: [{ type: "field_number", name: "DEGREES", value: 5, min: -90, max: 90, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: ACTION,
    tooltip: "轉的角度會隨著迴圈跑到第幾圈而變大。第一圈不轉，第二圈轉一份，第三圈轉兩份……畫出來是螺旋",
  },
  {
    // 放進迴圈就是累加器 —— 重複做加法，值會一路長上去
    type: "ls_add_speed",
    message0: "子彈速度增加 %1",
    args0: [{ type: "field_number", name: "VALUE", value: 60, min: -300, max: 300, precision: 10 }],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "在原本的速度上加減。放在迴圈裡會一次比一次快，射出分層的波",
  },
  {
    type: "ls_add_size",
    message0: "子彈大小增加 %1",
    args0: [{ type: "field_number", name: "VALUE", value: 1, min: -6, max: 6, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "在原本的大小上加減。放在迴圈裡會一發比一發大",
  },
  {
    type: "ls_set_life",
    message0: "子彈存活 %1 秒 %2",
    args0: [
      { type: "field_number", name: "VALUE", value: 1.6, min: 0.2, max: 5, precision: 0.1 },
      { type: "field_label", name: "HINT", text: "" },
    ],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "子彈飛多久後消失。速度 × 存活時間 = 射程",
  },
  {
    type: "ls_split",
    message0: "子彈改為分裂",
    previousStatement: null,
    nextStatement: null,
    colour: RARE,
    tooltip: "稀有積木。命中時分裂成兩發較小的子彈，往兩側散開",
  },
  {
    // 箭矢專用。刻意用「前進／右轉」而非「移動／旋轉」，
    // 與子彈的「方向旋轉」在字面上就分得開，避免學生混淆兩套座標概念
    type: "ls_forward",
    message0: "前進 %1",
    args0: [{ type: "field_number", name: "VALUE", value: 60, min: 10, max: 200, precision: 5 }],
    previousStatement: null,
    nextStatement: null,
    colour: "#4CBF56",
    tooltip: "箭矢往目前的方向前進。距離越長，走完花的時間越久",
  },
  {
    type: "ls_right",
    message0: "右轉 %1 度",
    args0: [{ type: "field_number", name: "DEGREES", value: 60, min: -180, max: 180, precision: 1 }],
    previousStatement: null,
    nextStatement: null,
    colour: "#4CBF56",
    tooltip: "箭矢原地轉向。正 N 邊形的每次轉角 = 360 ÷ N",
  },
  {
    /**
     * 與迴圈相乘效果最明顯的一塊：八方射線每發都彎，就成了旋渦。
     * 它不取代迴圈，而是讓同一個迴圈畫出完全不同的圖形。
     */
    type: "ls_set_curve",
    message0: "子彈轉向 每秒 %1 度",
    args0: [{ type: "field_number", name: "DEGREES", value: 90, min: -360, max: 360, precision: 5 }],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "子彈會沿著弧線飛。正值往右彎、負值往左彎，0 是直線",
  },
  {
    type: "ls_set_muzzle",
    message0: "發射點距離設為 %1",
    args0: [{ type: "field_number", name: "VALUE", value: 12, min: 0, max: 160, precision: 4 }],
    previousStatement: null,
    nextStatement: null,
    colour: STATE,
    tooltip: "子彈從離角色這麼遠的地方生出來。配合旋轉迴圈就是一圈發射點",
  },
  {
    type: "ls_wait_by_index",
    message0: "等待 %1 秒 × 迴圈次數",
    args0: [{ type: "field_number", name: "SECONDS", value: 0.05, min: 0, max: 1, precision: 0.05 }],
    previousStatement: null,
    nextStatement: null,
    colour: CONTROL,
    tooltip: "第一圈不等，之後每圈多等一份 —— 做出越來越慢的節奏",
  },
];
