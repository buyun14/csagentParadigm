/**
 * SSE 流式响应提取器
 *
 * 快通道 LLM 输出的是 JSON（含 intent/next_state/response/entities），
 * 若把原始 JSON 直接流给前端/TTS，会出现"打字机在打 JSON"的体验问题，
 * 且 TTS 接入方无法直接消费。本模块在服务端对 LLM 流做增量解析：
 * 只把 response 字段的文本内容实时提取出来，chunk 事件下发的就是最终话术。
 *
 * 实现为轻量状态机，容忍 chunk 任意切分（关键词、转义符、unicode 跨块）。
 * 纯函数、无依赖，可独立单测。
 */

export interface ResponseExtractor {
  /** 输入一个 LLM 文本块，返回应流式下发的 response 增量文本 */
  push(chunk: string): string;
  /** 是否已定位到 response 字段 */
  readonly started: boolean;
  /** 是否已完成整个 response 值（关闭引号） */
  readonly done: boolean;
}

/** 匹配 "response": "（容忍空白），包含起始引号 */
const PREFIX_RE = /"response"\s*:\s*"/;

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

export function createResponseExtractor(): ResponseExtractor {
  let searchBuf = '';
  let started = false;
  let done = false;
  let escape = false;
  let unicodeMode = false;
  let unicodeHex = '';

  /** 处理 response 值内的字符流，遇到未转义的结束引号停止 */
  function processValue(text: string): string {
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (done) break;

      // 正在累积 \uXXXX
      if (unicodeMode) {
        if (/[0-9a-fA-F]/.test(ch)) {
          unicodeHex += ch;
          if (unicodeHex.length === 4) {
            out += String.fromCharCode(parseInt(unicodeHex, 16));
            unicodeHex = '';
            unicodeMode = false;
          }
        } else {
          // 非法 unicode 序列：按原样输出已收前缀并重处理当前字符
          out += unicodeHex;
          unicodeHex = '';
          unicodeMode = false;
          i--;
        }
        continue;
      }

      if (escape) {
        escape = false;
        if (ch === 'u') {
          unicodeMode = true;
          unicodeHex = '';
        } else if (Object.prototype.hasOwnProperty.call(ESCAPES, ch)) {
          out += ESCAPES[ch];
        } else {
          out += ch;
        }
        continue;
      }

      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        done = true;
        break;
      }
      out += ch;
    }
    return out;
  }

  return {
    push(chunk: string): string {
      if (done || !chunk) return '';
      if (!started) {
        searchBuf += chunk;
        // 防止恶意超长前缀撑爆内存；response 键出现在 16KB 内属正常范围
        if (searchBuf.length > 16384) searchBuf = searchBuf.slice(-16384);
        const m = PREFIX_RE.exec(searchBuf);
        if (m && m.index !== undefined) {
          started = true;
          const rest = searchBuf.slice(m.index + m[0].length);
          searchBuf = '';
          return processValue(rest);
        }
        return '';
      }
      return processValue(chunk);
    },
    get started() {
      return started;
    },
    get done() {
      return done;
    },
  };
}
