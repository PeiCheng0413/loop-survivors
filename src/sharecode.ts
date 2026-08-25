/**
 * 分享碼：把學生的進度編成一串可複製的文字（docs/DECISIONS.md §11 零後端方案）。
 *
 * ## 關於「加密」的誠實說明
 *
 * 這個遊戲是純靜態網站，**任何金鑰都必須隨程式碼送到學生的瀏覽器**。
 * 學生打開開發者工具就能讀到它並偽造任意座號的分享碼 ——
 * 沒有伺服器就沒有真正的防偽，這是密碼學的硬限制。
 *
 * 所以這裡做的是**可歸屬 ＋ 防手改**，不是加密：
 *
 * - **可歸屬**：班級座號嵌在碼裡。學生 B 交出學生 A 的碼時，
 *   畫面會顯示「這是 A 的存檔」，老師一眼看得出不符。
 *   課堂上真正會發生的抄襲是這種，而署名就擋得住。
 * - **防手改**：附一段簽章，改動任何字元都會驗證失敗，
 *   擋掉「把座號 5 改成 12」這種順手的竄改。
 *
 * 擋不住真的去讀原始碼的學生 —— 但會做到那一步的人，通常不是抄襲的那群。
 */

/**
 * 簽章用的金鑰。**它會出現在打包後的 JavaScript 裡，這是無法避免的。**
 * 它的作用是讓竄改需要「知道怎麼重算簽章」，而不是提供機密性。
 */
const SIGN_KEY = "loop-survivors/v1/tamper-evident";

/**
 * 遮罩用的種子。與 SIGN_KEY 分開，破解時要分別找出兩者。
 */
const MASK_SEED = "loop-survivors/v2/mask";

/** 未壓縮與已壓縮的前綴，讓解碼端知道要不要解壓 */
const PREFIX_PLAIN = "LSV2";
const PREFIX_DEFLATE = "LSV2Z";

export interface Identity {
  /** 班級，例如「三年二班」 */
  klass: string;
  /** 座號 */
  seat: string;
}

export interface DecodeResult<T> {
  ok: boolean;
  /** 解碼失敗時為 null */
  data: T | null;
  /** 給使用者看的說明 */
  message: string;
  /** 簽章是否相符。false 代表這串碼被改過 */
  authentic: boolean;
}

// ---- 編碼 -------------------------------------------------------------

export async function encode<T>(payload: T): Promise<string> {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  const packed = await deflate(bytes);
  // 遮罩：讓內容不再是一眼認得出的 deflate 串流。
  // 想改存檔的人必須先發現有這一層，才有辦法解壓
  const masked = await mask(packed ?? bytes);

  const body = toBase64Url(masked);
  const prefix = packed ? PREFIX_DEFLATE : PREFIX_PLAIN;
  const sign = await signature(prefix + body);
  // 分隔符用「.」而非「-」：base64url 的字元集本來就包含 - 與 _，
  // 拿它們當分隔符會在內容剛好出現時切錯。JWT 用「.」也是同一個理由。
  return `${prefix}.${body}.${sign}`;
}

export async function decode<T>(code: string): Promise<DecodeResult<T>> {
  const trimmed = code.trim().replace(/\s+/g, "");
  const parts = trimmed.split(".");
  if (parts.length !== 3) {
    return { ok: false, data: null, authentic: false, message: "格式不對，請確認整串都有複製到" };
  }

  const [prefix, body, sign] = parts;
  if (prefix !== PREFIX_PLAIN && prefix !== PREFIX_DEFLATE) {
    return { ok: false, data: null, authentic: false, message: "不是這個遊戲的分享碼" };
  }

  const authentic = (await signature(prefix + body)) === sign;

  try {
    const raw = await mask(fromBase64Url(body));
    const bytes = prefix === PREFIX_DEFLATE ? await inflate(raw) : raw;
    const data = JSON.parse(new TextDecoder().decode(bytes)) as T;
    return {
      ok: true,
      data,
      authentic,
      // 簽章不符仍然讓它讀進來 —— 學生可能只是複製時漏字，
      // 直接拒絕會讓人不知道發生什麼事。標示出來由老師判斷即可
      message: authentic ? "讀取成功" : "讀取成功，但這串碼被修改過",
    };
  } catch {
    // 簽章不符時多半就是被改壞的，講清楚比只說「損毀」有用
    return {
      ok: false,
      data: null,
      authentic,
      message: authentic ? "內容損毀，無法讀取" : "這串碼被修改過，已經無法讀取",
    };
  }
}

// ---- 簽章與編碼工具 ----------------------------------------------------

/**
 * 以 HMAC-SHA256 產生簽章，取前 12 個字元。
 *
 * 12 個字元約 48 bits —— 要靠亂猜改出一個通過驗證的碼並不划算，
 * 而真正的攻擊路徑（讀原始碼拿金鑰）本來就防不住，加長沒有意義。
 */
async function signature(input: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGN_KEY),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return toBase64Url(new Uint8Array(mac)).slice(0, 12);
}

/**
 * 以種子產生的位元流做 XOR 遮罩。XOR 是對稱的，同一個函式負責加解。
 *
 * ## 這一層的用意
 *
 * 它擋不住真的想破解的人 —— 金鑰就在打包後的 JavaScript 裡（見檔頭說明）。
 * 它的作用是**製造認知成本**：想改存檔的人必須依序想通
 * base64 → 遮罩 → deflate → JSON → 重算簽章，五層都得懂。
 *
 * 而如果學生真的走完這條路 —— 那他學到的東西比這個遊戲本身還多。
 * **偷吃步在這裡也是一種學習路徑**，所以我們不需要把它堵死，
 * 只需要讓它貴到不像捷徑。
 */
async function mask(bytes: Uint8Array): Promise<Uint8Array> {
  const out = new Uint8Array(bytes.length);
  let stream = new Uint8Array(0);
  let block = 0;
  for (let i = 0; i < bytes.length; i++) {
    const offset = i % 32;
    if (offset === 0) {
      const seed = new TextEncoder().encode(`${MASK_SEED}/${block++}`);
      stream = new Uint8Array(await crypto.subtle.digest("SHA-256", seed));
    }
    out[i] = bytes[i] ^ stream[offset];
  }
  return out;
}

/** 壓縮。瀏覽器沒有 CompressionStream 時回傳 null，改用未壓縮格式 */
async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
