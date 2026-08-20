import type { Card } from "./cards";

/**
 * 升等時的三選一卡片。
 *
 * 選完卡**不會自動繼續遊戲** —— 學生需要時間把積木插進腳本裡，
 * 那個「這塊該放外層還是內層」的思考才是升級的教學意義所在
 * （見 docs/DECISIONS.md §2）。要繼續得自己按空白鍵。
 */
export class LevelUp {
  private root: HTMLElement;
  private onPick: (card: Card) => void;
  private cards: Card[] = [];
  private open_ = false;

  constructor(root: HTMLElement, onPick: (card: Card) => void) {
    this.root = root;
    this.onPick = onPick;
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(cards: Card[], level: number): void {
    this.cards = cards;
    this.open_ = true;
    this.root.classList.remove("hidden");
    this.root.innerHTML =
      `<div class="levelup-box">
        <div class="levelup-title">等級 ${level}　選一張</div>
        <div class="levelup-cards"></div>
        <div class="levelup-hint">選完可以繼續調整積木，按空白鍵回到戰場</div>
      </div>`;

    const list = this.root.querySelector(".levelup-cards")!;
    cards.forEach((card, i) => {
      const el = document.createElement("button");
      el.className = `levelup-card ${card.kind}`;
      el.innerHTML =
        `<span class="levelup-key">${i + 1}</span>
         <span class="levelup-kind">${card.kind === "block" ? "積木" : "屬性"}</span>
         <span class="levelup-name"></span>
         <span class="levelup-desc"></span>`;
      // 卡片文字用 textContent 填入，避免日後加入自訂名稱時被當成 HTML
      el.querySelector(".levelup-name")!.textContent = card.name;
      el.querySelector(".levelup-desc")!.textContent = card.desc;
      el.addEventListener("click", () => this.pick(i));
      list.appendChild(el);
    });
  }

  pick(index: number): void {
    if (!this.open_) return;
    const card = this.cards[index];
    if (!card) return;
    this.close();
    this.onPick(card);
  }

  close(): void {
    this.open_ = false;
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }
}
