import { describe, it, expect } from 'vitest';
import { correctAsrText, asrCorrectionRules } from './asr-corrections';
import { recognizeIntent } from './intent';

describe('ASR 谐音纠错 correctAsrText', () => {
  it('品牌谐音：蔚莱/未来 → 蔚来', () => {
    expect(correctAsrText('我想看蔚莱')).toBe('我想看蔚来');
    expect(correctAsrText('未来ES8怎么样')).toBe('蔚来ES8怎么样');
  });

  it('品牌谐音：比亚滴 → 比亚迪', () => {
    expect(correctAsrText('比亚滴汉')).toBe('比亚迪汉');
  });

  it('车型谐音：一十八 → ES8', () => {
    expect(correctAsrText('蔚来一十八')).toBe('蔚来ES8');
  });

  it('车型谐音：毛豆歪 → Model Y', () => {
    expect(correctAsrText('特斯拉毛豆歪')).toBe('特斯拉Model Y');
  });

  it('车型谐音：小米舒淇 → 小米 SU7', () => {
    expect(correctAsrText('小米舒淇多少钱')).toBe('小米 SU7多少钱');
  });

  it('小写字母转大写：su7 → SU7', () => {
    expect(correctAsrText('su7')).toBe('SU7');
  });

  it('无谐音文本保持不变', () => {
    expect(correctAsrText('我想了解一下购车优惠')).toBe('我想了解一下购车优惠');
  });

  it('纠错规则非空且含注释', () => {
    expect(asrCorrectionRules.length).toBeGreaterThan(0);
    expect(asrCorrectionRules.every((r) => r.note)).toBe(true);
  });
});

describe('ASR 纠错与意图识别集成', () => {
  it('“未来ES8”识别为蔚来 ES8（confirm_model）', () => {
    const r = recognizeIntent('未来一十八怎么样');
    expect(r.intent).toBe('confirm_model');
    expect(r.entities.brand).toBe('蔚来');
    expect(r.entities.series).toBe('ES8');
  });

  it('“毛豆歪”识别为 Model Y（confirm_model）', () => {
    const r = recognizeIntent('我想看毛豆歪');
    expect(r.intent).toBe('confirm_model');
    expect(r.entities.series).toBe('Model Y');
  });

  it('“比亚滴”识别为比亚迪（confirm_brand）', () => {
    const r = recognizeIntent('我想看比亚滴');
    expect(r.intent).toBe('confirm_brand');
    expect(r.entities.brand).toBe('比亚迪');
  });
});
