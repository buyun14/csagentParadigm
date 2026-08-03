import { createInitialState, processCustomerInput, checkCacheHit } from '../src/lib/agent/engine';
import type { MainDialogState, CollectedSlots } from '../src/lib/agent/types';

const emptySlots: CollectedSlots = {
  brand: null, series: null, model: null, city: null, timing: null,
  surname: null, phoneTail: null, vehicleType: null, powerType: null,
};

// 每个用例独立初始化（避免 FAREWELL 终态缓存干扰），可指定初始状态与已确认槽位
function runCase(label: string, input: string, initial: MainDialogState = 'GREETING', slots: CollectedSlots = emptySlots) {
  const s = { ...createInitialState(), currentState: initial, collectedSlots: { ...slots } };
  const cache = checkCacheHit(s.currentState, input);
  if (cache.hit) {
    console.log(`[${label}] 输入: ${input} → [缓存命中] ${(cache.response || '').slice(0, 22)}`);
    return;
  }
  const r = processCustomerInput(s, input, 'rule');
  const ns = r.newState;
  console.log(`[${label}] 输入: ${input} → 状态: ${ns.currentState} | intent: ${ns.lastDecision?.perception.intent} | 回复: ${(r.agentMessage.content || '').slice(0, 28)}`);
}

console.log('=== 1. 正常闭环（连续对话）===');
{
  let s = createInitialState();
  const steps = ['你好', '我看蔚来', 'ES8', '我在北京', '下个月', '我姓王'];
  for (const input of steps) {
    const cache = checkCacheHit(s.currentState, input);
    if (cache.hit) { console.log(`  输入: ${input} → [缓存命中] ${(cache.response || '').slice(0, 20)}`); continue; }
    const r = processCustomerInput(s, input, 'rule');
    s = r.newState;
    console.log(`  输入: ${input} → 状态: ${s.currentState} | 回复: ${(r.agentMessage.content || '').slice(0, 30)}`);
  }
}

console.log('\n=== 2. 独立场景 ===');
runCase('开场问候', '喂你好', 'GREETING');
runCase('辱骂护栏', '你傻逼吧', 'BRAND_INQUIRY');
runCase('反感护栏', '不要再打了', 'MODEL_INQUIRY');
runCase('偏离拉回', '今天天气不错哈哈', 'BRAND_INQUIRY');
runCase('超范围(价格)', '落地多少钱？', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来' });
runCase('ASR谐音', '未来一十八怎么样', 'GREETING');
runCase('否定防误收集', '我不想看蔚来', 'BRAND_INQUIRY');
runCase('不回问-品牌已确认', '可以', 'BRAND_INQUIRY', { ...emptySlots, brand: '蔚来' });
runCase('不回问-车系已确认', '可以', 'MODEL_INQUIRY', { ...emptySlots, brand: '蔚来', series: 'ES8' });
runCase('姓氏闭环', '我姓王', 'CONTACT_COLLECTION');
