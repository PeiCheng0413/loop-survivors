/**
 * 設定的匯總出口。
 *
 * 拆成資料夾而非單一檔案，是為了讓調平衡時知道**該去哪裡找** ——
 * 原本 300 行的 config.ts 把武器、敵人、護盾、介面全混在一起，
 * 想調某個數值得先滑半天。
 *
 *   runtime   執行引擎的基本參數（通常不該動）
 *   combat    戰鬥數值 —— 平衡調整的主戰場
 *   enemies   敵人原型與階段輪替
 *   progress  經驗與升級曲線
 *   shield    幾何護盾（獨立於武器的插件）
 *   ui        介面參數
 *
 * 對外仍然是 `from "../config"`，所以拆分不影響任何既有的引用。
 */
export * from "./runtime";
export * from "./combat";
export * from "./enemies";
export * from "./progress";
export * from "./shield";
export * from "./ui";
