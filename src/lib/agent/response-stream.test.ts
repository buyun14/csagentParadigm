import { describe, it, expect } from 'vitest';
import { createResponseExtractor } from './response-stream';

function collect(inputs: string[]): string {
  const ex = createResponseExtractor();
  return inputs.map((c) => ex.push(c)).join('');
}

describe('createResponseExtractor 流式 response 提取', () => {
  it('完整 JSON 一次下发 → 仅返回 response 文本', () => {
    const out = collect([
      '{"intent":"confirm_brand","next_state":"MODEL_INQUIRY","response":"好的，您关注什么车呢？","entities":{}}',
    ]);
    expect(out).toBe('好的，您关注什么车呢？');
  });

  it('chunk 逐字符切分 → 仍能完整还原', () => {
    const full =
      '{"intent":"confirm_brand","next_state":"MODEL_INQUIRY","response":"好的，您关注什么车呢？","entities":{}}';
    expect(collect([...full])).toBe('好的，您关注什么车呢？');
  });

  it('response 关键词跨 chunk 切分', () => {
    const full = '{"a":"b","resp' + 'onse":"关键词跨块","c":1}';
    expect(collect([full.slice(0, 12), full.slice(12)])).toBe('关键词跨块');
  });

  it('冒号后带空白也能匹配', () => {
    const ex = createResponseExtractor();
    expect(ex.push('{"response"  :  "带空格"}')).toBe('带空格');
    expect(ex.done).toBe(true);
  });

  it('response 在 entities 之后也能提取', () => {
    const out = collect([
      '{"intent":"confirm_model","entities":{"车系":"汉"},"next_state":"CITY_INQUIRY","response":"汉可以的","x":1}',
    ]);
    expect(out).toBe('汉可以的');
  });

  it('转义字符正确还原（引号/换行）', () => {
    const full = '{"response":"他说\\"好的\\"\\n谢谢","x":1}';
    expect(collect([full])).toBe('他说"好的"\n谢谢');
  });

  it('unicode 转义跨 chunk 切分 → 正确还原', () => {
    const full = '{"response":"\\u6c7d\\u8f66\\u5927\\u5382"}';
    const ex = createResponseExtractor();
    const parts: string[] = [];
    for (let i = 0; i < full.length; i += 2) parts.push(full.slice(i, i + 2));
    let out = '';
    for (const p of parts) out += ex.push(p);
    expect(out).toBe('汽车大厂');
  });

  it('response 为空字符串 → started=true / done=true / 无输出', () => {
    const ex = createResponseExtractor();
    expect(ex.push('{"intent":"x","response":""}')).toBe('');
    expect(ex.started).toBe(true);
    expect(ex.done).toBe(true);
  });

  it('纯文本（无 response 字段）→ started 保持 false', () => {
    const ex = createResponseExtractor();
    expect(ex.push('您好，请问有什么可以帮您')).toBe('');
    expect(ex.started).toBe(false);
    expect(ex.done).toBe(false);
  });

  it('done 之后继续 push → 空输出', () => {
    const ex = createResponseExtractor();
    ex.push('{"response":"说完"}');
    expect(ex.push('多余内容')).toBe('');
  });
});
