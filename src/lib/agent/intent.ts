import type { IntentType } from './types';
import { resolveBrand, resolveType, resolvePower } from './knowledge-base';

// 意图识别结果
export interface IntentResult {
  intent: IntentType;
  entities: Record<string, string>;
  confidence: number;
}

// 问候词
const greetWords = [
  '喂', '你好', '您好', '嗨', 'hi', 'hello', '在吗', '在的',
  '嗯', '嗯嗯', '哦', '哦哦', '啊', '好的',
];

// 肯定/同意词
const agreeWords = [
  '好的', '好', '行', '可以', '没问题', '嗯', '对', '对的',
  '是的', '没错', '好嘞', '行吧', '好吧', '那行', '中', '中啊',
  '好吧', '嗯好', '好好好', 'ok', 'OK', '行嘞', '是',
  '考虑', '可以考虑', '有兴趣',
];

// 否定词
const disagreeWords = [
  '不要', '不用', '不需要', '不考虑', '算了', '不了', '别',
  '没有', '没', '不想', '不需要', '不必', '暂不需要',
  '不买', '不买了',
];

// 辱骂词
const abuseWords = [
  '滚', '傻逼', 'sb', '操', '妈的', '去死', '神经病', '有病',
  '垃圾', '废物', '烦死了', '骚扰', '骗子', '混蛋', '无耻',
  '不要脸', '恶心', '讨厌', '去你妈', '你妈', '草泥马',
  '麻痹', '逼', '贱', '蠢', '智障',
];

// 反感表达
const dislikeWords = [
  '又是推销', '别打了', '别打了', '不要再打了', '烦不烦',
  '天天打', '怎么又打', '说了不要', '已经买过了', '不需要谢谢',
  '别骚扰', '拉黑', '投诉', '举报',
];

// 告别词
const farewellWords = [
  '再见', '拜拜', 'bye', '挂了', '先这样', '就这样',
  '好的再见', '嗯再见', '谢谢再见',
];

// 等待词
const waitWords = [
  '等一下', '等等', '稍等', '等下', '等一会', '先别急',
  '我想想', '让我想想',
];

// 城市列表（常见城市）
const cities = [
  '北京', '上海', '广州', '深圳', '成都', '杭州', '重庆', '武汉',
  '西安', '南京', '天津', '苏州', '长沙', '郑州', '东莞', '青岛',
  '昆明', '宁波', '合肥', '佛山', '厦门', '哈尔滨', '济南', '温州',
  '大连', '贵阳', '南宁', '石家庄', '太原', '南昌', '金华', '常州',
  '泉州', '嘉兴', '南通', '中山', '惠州', '珠海', '徐州', '海口',
  '兰州', '呼和浩特',
];

// 时间表达
const timePatterns = [
  { regex: /最近|这几天|这周|本周/, value: '最近' },
  { regex: /下个月|下月/, value: '下个月' },
  { regex: /这个月|本月/, value: '这个月' },
  { regex: /年底|过年|春节前|年前/, value: '年底' },
  { regex: /上半年|年中/, value: '上半年' },
  { regex: /下半年/, value: '下半年' },
  { regex: /(\d{1,2})月/, value: '' }, // 动态匹配
  { regex: /五一|十一|国庆|元旦/, value: '' },
  { regex: /快了|马上|尽快|近期/, value: '近期' },
  { regex: /还早|不着急|慢慢看|先看看/, value: '不着急' },
  { regex: /暑假|寒假/, value: '' },
];

// 姓氏识别
const surnames = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈',
  '褚', '卫', '蒋', '沈', '韩', '杨', '朱', '秦', '尤', '许',
  '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏',
  '陶', '姜', '戚', '谢', '邹', '喻', '柏', '水', '窦', '章',
  '苏', '潘', '葛', '奚', '范', '彭', '郎', '鲁', '韦', '昌',
  '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳', '鲍',
  '史', '唐', '费', '廉', '岑', '薛', '雷', '贺', '倪', '汤',
  '滕', '殷', '罗', '毕', '郝', '邬', '安', '常', '乐', '于',
  '傅', '皮', '齐', '伍', '余', '元', '卜', '顾', '孟', '黄',
  '穆', '萧', '尹', '姚', '邵', '湛', '汪', '祁', '毛', '禹',
  '狄', '米', '贝', '明', '臧', '计', '成', '戴', '宋', '茅',
  '庞', '熊', '纪', '舒', '屈', '项', '祝', '董', '梁', '杜',
  '阮', '蓝', '闵', '席', '季', '麻', '强', '贾', '路', '娄',
  '危', '江', '童', '颜', '郭', '梅', '盛', '林', '刁', '钟',
  '徐', '邱', '骆', '高', '夏', '蔡', '田', '樊', '胡', '凌',
  '霍', '虞', '万', '支', '柯', '管', '卢', '莫', '经', '房',
  '裘', '缪', '干', '解', '应', '宗', '丁', '宣', '邓', '郁',
  '单', '杭', '洪', '包', '诸', '左', '石', '崔', '吉', '龚',
  '程', '嵇', '邢', '滑', '裴', '陆', '荣', '翁', '荀', '羊',
  '於', '惠', '甄', '曲', '家', '封', '芮', '羿', '储', '靳',
  '汲', '邴', '糜', '松', '井', '段', '富', '巫', '乌', '焦',
  '巴', '弓', '牧', '隗', '山', '谷', '车', '侯', '全', '仰',
  '秋', '仲', '伊', '宫', '宁', '仇', '栾', '暴', '甘', '钭',
  '厉', '戎', '祖', '武', '符', '刘', '景', '詹', '束', '龙',
  '叶', '幸', '司', '韶', '黎', '薄', '印', '宿', '白', '怀',
  '蒲', '赖', '卓', '屠', '蒙', '池', '乔', '阴', '郁', '胥',
  '能', '苍', '双', '闻', '莘', '党', '翟', '谭', '贡', '劳',
  '逄', '姬', '申', '扶', '堵', '冉', '宰', '雍', '桑', '桂',
  '濮', '牛', '寿', '通', '边', '扈', '燕', '冀', '浦', '尚',
  '农', '温', '别', '庄', '晏', '柴', '瞿', '阎', '充', '慕',
  '连', '茹', '习', '宦', '艾', '鱼', '容', '向', '古', '易',
  '慎', '戈', '廖', '庾', '终', '暨', '居', '衡', '步', '都',
  '耿', '满', '弘', '匡', '国', '文', '寇', '广', '禄', '阙',
  '东', '欧', '沃', '越', '隆', '师', '巩', '厍', '聂', '晁',
  '勾', '敖', '融', '冷', '訾', '辛', '阚', '那', '简', '饶',
  '空', '曾', '沙', '养', '鞠', '须', '丰', '巢', '关', '查',
  '后', '荆', '红', '游', '竺', '权', '逯', '盖', '益', '桓',
  '公', '欧阳', '司马', '上官', '诸葛', '东方', '皇甫', '令狐',
];

// 超范围问题关键词
const outOfScopePatterns = [
  /多少钱|什么价|价格|报价|落地价|全款|贷款|分期|月供/,
  /优惠|折扣|降价|促销|活动|补贴/,
  /配置|参数|续航|马力|扭矩|排量/,
  /保养|维修|售后|保修|质保/,
  /试驾|体验|看车/,
  /保险|上牌|购置税/,
  /油耗|电耗|充电/,
  /自动|手动|挡|变速箱/,
  /颜色|内饰|外观|座椅/,
  /对比|哪个好|推荐哪款|怎么选/,
  /二手车|置换|旧车/,
  /现车|提车|等车|交付/,
];

/**
 * 意图识别
 */
export function recognizeIntent(input: string): IntentResult {
  const text = input.trim();

  // 空输入
  if (!text) {
    return { intent: 'unclear', entities: {}, confidence: 0 };
  }

  // 1. 检查辱骂
  for (const word of abuseWords) {
    if (text.includes(word)) {
      return { intent: 'abuse', entities: {}, confidence: 0.95 };
    }
  }

  // 2. 检查反感
  for (const word of dislikeWords) {
    if (text.includes(word)) {
      return { intent: 'dislike', entities: {}, confidence: 0.9 };
    }
  }

  // 3. 提取实体
  const entities: Record<string, string> = {};

  // 提取品牌
  const brand = resolveBrand(text);
  if (brand) entities.brand = brand;

  // 提取车身类型
  const vehicleType = resolveType(text);
  if (vehicleType) entities.vehicleType = vehicleType;

  // 提取动力类型
  const powerType = resolvePower(text);
  if (powerType) entities.powerType = powerType;

  // 提取城市
  for (const city of cities) {
    if (text.includes(city)) {
      entities.city = city;
      break;
    }
  }

  // 提取时间
  for (const tp of timePatterns) {
    const match = text.match(tp.regex);
    if (match) {
      entities.timing = tp.value || match[0];
      break;
    }
  }

  // 提取姓氏
  for (const s of surnames) {
    // 匹配 "姓X" 或 "我姓X" 或 "X先生/女士" 或单独的姓氏回复
    const patterns = [
      new RegExp(`姓${s}`),
      new RegExp(`${s}先生`),
      new RegExp(`${s}女士`),
    ];
    for (const p of patterns) {
      if (p.test(text)) {
        entities.surname = s;
        break;
      }
    }
    if (entities.surname) break;
  }

  // 如果文本很短且只包含一个姓氏，也认为是姓氏确认
  if (!entities.surname && text.length <= 3) {
    for (const s of surnames) {
      if (text === s || text === `我姓${s}` || text === `老${s}`) {
        entities.surname = s;
        break;
      }
    }
  }

  // 提取手机尾号
  const phoneMatch = text.match(/(\d{4})\s*(尾号|后四位|后4位|末四位)/);
  if (phoneMatch) {
    entities.phoneTail = phoneMatch[1];
  }
  const phoneMatch2 = text.match(/(尾号|后四位|后4位|末四位)\s*(\d{4})/);
  if (phoneMatch2) {
    entities.phoneTail = phoneMatch2[2];
  }
  // 直接输入4位数字
  if (!entities.phoneTail && /^\d{4}$/.test(text)) {
    entities.phoneTail = text;
  }

  // 提取车型（品牌+系列组合，如ES8、Model 3等）
  const seriesPatterns: Record<string, string[]> = {
    '蔚来': ['ET5', 'ET7', 'ES6', 'ES7', 'ES8', 'EC6'],
    '比亚迪': ['汉', '秦', '宋', '唐', '海豚'],
    '理想': ['L7', 'L8', 'L9', 'MEGA'],
    '特斯拉': ['Model 3', 'Model Y', 'Model S', 'Model X', 'model3', 'modely', 'models', 'modelx'],
    '小鹏': ['P7', 'G6', 'G9', 'X9'],
  };

  for (const [brandName, seriesList] of Object.entries(seriesPatterns)) {
    for (const series of seriesList) {
      if (text.toLowerCase().includes(series.toLowerCase())) {
        entities.series = series;
        entities.brand = brandName;
        break;
      }
    }
    if (entities.series) break;
  }

  // 4. 判断意图
  // 告别
  for (const word of farewellWords) {
    if (text.includes(word)) {
      return { intent: 'farewell', entities, confidence: 0.85 };
    }
  }

  // 等待
  for (const word of waitWords) {
    if (text.includes(word)) {
      return { intent: 'wait', entities, confidence: 0.8 };
    }
  }

  // 问候（短文本且包含问候词）
  if (text.length <= 5) {
    for (const word of greetWords) {
      if (text === word || text.includes(word)) {
        return { intent: 'greet', entities, confidence: 0.8 };
      }
    }
  }

  // 超范围问题
  for (const pattern of outOfScopePatterns) {
    if (pattern.test(text)) {
      return { intent: 'out_of_scope', entities, confidence: 0.75 };
    }
  }

  // 肯定/同意
  if (text.length <= 8) {
    for (const word of agreeWords) {
      if (text === word || text.includes(word)) {
        return { intent: 'agree', entities, confidence: 0.8 };
      }
    }
  }

  // 否定
  for (const word of disagreeWords) {
    if (text.includes(word)) {
      return { intent: 'disagree', entities, confidence: 0.8 };
    }
  }

  // 有实体提取到 → 根据实体类型判断
  if (entities.surname) return { intent: 'confirm_surname', entities, confidence: 0.9 };
  if (entities.city) return { intent: 'confirm_city', entities, confidence: 0.9 };
  if (entities.timing) return { intent: 'confirm_time', entities, confidence: 0.9 };
  if (entities.series) return { intent: 'confirm_model', entities, confidence: 0.9 };
  if (entities.brand && !entities.series) return { intent: 'confirm_brand', entities, confidence: 0.85 };
  if (entities.vehicleType || entities.powerType) return { intent: 'filter_vehicle', entities, confidence: 0.8 };

  // 请求推荐
  if (/推荐|建议|帮我选|你觉得|哪个好的/.test(text)) {
    return { intent: 'ask_recommend', entities, confidence: 0.75 };
  }

  // 询问车辆信息
  if (/有什么车|哪些车|有什么.*车型|车系列/.test(text)) {
    return { intent: 'ask_vehicle', entities, confidence: 0.75 };
  }

  // 不清晰
  if (text.length <= 2 && !Object.keys(entities).length) {
    return { intent: 'unclear', entities, confidence: 0.5 };
  }

  // 有实体但无法明确归类 → 根据当前状态判断（交给状态机处理）
  if (Object.keys(entities).length > 0) {
    return { intent: 'unknown', entities, confidence: 0.6 };
  }

  // 完全无法识别
  return { intent: 'off_track', entities: {}, confidence: 0.5 };
}
