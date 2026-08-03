import { createInitialState, processCustomerInput } from '../src/lib/agent/engine';

// llm 模式（无 key 时降级规则引擎）
const s1 = createInitialState();
const r1 = processCustomerInput(s1, '我看比亚迪', 'llm');
console.log('llm 模式:', r1.newState.responseSource, '| 品牌:', r1.newState.collectedSlots.brand, '| 状态:', r1.newState.currentState);

// dual 模式（无 key 时 processCustomerInput 降级 + 快通道失败 fallbackToRuleEngine 单测覆盖）
const s2 = createInitialState();
const r2 = processCustomerInput(s2, '你好', 'dual');
console.log('dual 模式(无key降级):', r2.newState.responseSource, '| 状态:', r2.newState.currentState);

// rule 模式正常路径
const s3 = createInitialState();
const r3 = processCustomerInput(s3, '我看蔚来', 'rule');
console.log('rule 模式:', r3.newState.responseSource, '| 品牌:', r3.newState.collectedSlots.brand, '| 状态:', r3.newState.currentState);
