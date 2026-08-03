/**
 * ASR 谐音/热词纠错词表（从老系统节点提示词"热词与纠错词典"技能提取）
 *
 * 电话外呼场景下，客户输入多为语音转文字，存在大量同音字/近音字/字母数字谐音。
 * 识别流程：先做文本归一化（correctAsrText），再走实体提取/意图识别。
 *
 * 注意：部分规则（如 文件→问界、未来→蔚来）在通用语境下有歧义，
 * 此处按老系统 ASR 激进纠错策略原样保留，汽车营销场景下命中率远高于误伤率。
 */

export interface AsrCorrectionRule {
  pattern: RegExp;
  replacement: string | ((substring: string) => string);
  /** 说明（便于维护/移交） */
  note?: string;
}

/** 品牌/车系谐音纠错 */
const brandCorrections: AsrCorrectionRule[] = [
  { pattern: /未来|蔚莱/g, replacement: '蔚来', note: '未来/蔚莱=蔚来（老系统热词，ASR 激进纠错）' },
  { pattern: /笨田/g, replacement: '本田', note: '笨田=本田' },
  { pattern: /保时姐|保时洁/g, replacement: '保时捷', note: '保时姐=保时捷' },
  { pattern: /比亚滴|比哑滴/g, replacement: '比亚迪', note: '比亚滴=比亚迪' },
  { pattern: /位牌|魏派|魏牌(?![高])/g, replacement: '魏牌', note: '位牌=魏牌' },
  { pattern: /吉利新苑/g, replacement: '吉利星愿', note: '吉利新苑=吉利星愿' },
  { pattern: /文件|文具/g, replacement: '问界', note: '文件/文具=问界（ASR 激进纠错）' },
  { pattern: /小彭|小朋/g, replacement: '小鹏', note: '小彭/小朋=小鹏' },
];

/** 车型字母+数字谐音纠错（核心难点） */
const seriesCorrections: AsrCorrectionRule[] = [
  { pattern: /一十八|一艾斯八|一s八/g, replacement: 'ES8', note: '一十八/一艾斯八=ES8' },
  { pattern: /一十六|一艾斯六|一s六/g, replacement: 'ES6', note: '一十六/一艾斯六=ES6' },
  { pattern: /e三版|e三班|一三百/g, replacement: 'E300', note: 'e三版=E300' },
  { pattern: /毛豆歪|毛豆y|模特y|model歪/g, replacement: 'Model Y', note: '毛豆歪/模特y=Model Y' },
  { pattern: /居老八|几十八|g老八/g, replacement: 'GL8', note: '居老八/几十八=GL8' },
  { pattern: /莫娜l零三|莫娜l03|莫娜零三/g, replacement: 'MONA L03', note: '莫娜l零三=MONA L03' },
  { pattern: /海斯/g, replacement: '海狮', note: '比亚迪海斯=海狮' },
  { pattern: /高三/g, replacement: '高山', note: '位牌高三=魏牌高山' },
  { pattern: /四七五/g, replacement: 'CT5', note: '凯迪拉克四七五=CT5' },
  { pattern: /小米舒淇|小米数七|小米数气/g, replacement: '小米 SU7', note: '小米舒淇/数七=小米 SU7' },
  { pattern: /小米逾期|小米语气/g, replacement: '小米 YU7', note: '小米逾期/语气=小米 YU7' },
  { pattern: /su7|yu7/g, replacement: (m) => m.toUpperCase(), note: '小写字母转大写（su7→SU7）' },
];

/** 全量纠错规则（品牌在前，车型在后，保证 "位牌高三" 先归一品牌再归一车系） */
const allCorrections: AsrCorrectionRule[] = [...brandCorrections, ...seriesCorrections];

/**
 * 对 ASR 文本做谐音/热词归一化
 */
export function correctAsrText(input: string): string {
  let text = input.trim();
  for (const rule of allCorrections) {
    text = text.replace(rule.pattern, rule.replacement as string);
  }
  return text;
}

/** 导出规则（供调试面板/移交文档展示） */
export const asrCorrectionRules = allCorrections;
