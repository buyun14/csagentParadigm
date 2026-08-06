import type { MainDialogState, ExceptionState, CollectedSlots } from './types';
import { queryVehicleKB, getBrandSeries, knowledgeBase } from './knowledge-base';
import type { IntentResult } from './intent';

// Agent 回复生成结果
export interface AgentResponse {
  reply: string;
  nextState: MainDialogState;
  nextException: ExceptionState;
  updatedSlots: CollectedSlots;
  reasoning: string;
  action: string;
}

/**
 * 获取当前状态应该追问的内容（已确认的信息不回问，直接引导下一步）
 */
function getCurrentQuestion(state: MainDialogState, slots: CollectedSlots): string {
  switch (state) {
    case 'GREETING':
      return '给您做一个报价，您参考了解一下哈，您看最近有比较关注哪款车呀？';
    case 'BRAND_INQUIRY':
      // 品牌已确认 → 不回问品牌，推进到车型
      if (slots.brand) return '好的，那您看想了解哪款车呢？';
      return '您看最近有比较关注哪个品牌的车呀？';
    case 'MODEL_INQUIRY': {
      // 车系已确认 → 不回问车系，推进到城市
      if (slots.series) return '想了解哪个城市的价格呢？在哪个城市看车购车方便呀？';
      if (slots.brand) {
        const series = getBrandSeries(slots.brand);
        if (series.length > 0) {
          return `${slots.brand}的话，有${series.join('、')}，您看您想了解哪款车呢？`;
        }
      }
      return '您看想了解哪款车呢？';
    }
    case 'CITY_INQUIRY':
      // 城市已确认 → 推进到时间
      if (slots.city) return '考虑什么时候购车呀？有大概时间吗？';
      return '想了解哪个城市的价格呢？在哪个城市看车购车方便呀？';
    case 'TIMING_INQUIRY':
      // 时间已确认 → 推进到联系方式
      if (slots.timing) return '那稍后将信息授权给当地4S店给您精准报价，请问您贵姓啊？';
      return '考虑什么时候购车呀？有大概时间吗？';
    case 'CONTACT_COLLECTION':
      if (!slots.surname) {
        return '您贵姓啊？';
      }
      // 姓氏已确认，信息闭环，不再追问
      return '好的，信息已确认，稍后会有专人联系您，祝您购车顺利！';
    case 'FAREWELL':
      return '';
    default:
      return '';
  }
}

/**
 * 推进到下一个主流程状态
 */
function getNextMainState(current: MainDialogState, slots: CollectedSlots): MainDialogState {
  switch (current) {
    case 'GREETING':
      return 'BRAND_INQUIRY';
    case 'BRAND_INQUIRY':
      if (slots.brand) return 'MODEL_INQUIRY';
      return 'BRAND_INQUIRY';
    case 'MODEL_INQUIRY':
      if (slots.series) return 'CITY_INQUIRY';
      return 'MODEL_INQUIRY';
    case 'CITY_INQUIRY':
      if (slots.city) return 'TIMING_INQUIRY';
      return 'CITY_INQUIRY';
    case 'TIMING_INQUIRY':
      if (slots.timing) return 'CONTACT_COLLECTION';
      return 'TIMING_INQUIRY';
    case 'CONTACT_COLLECTION':
      if (slots.surname) return 'FAREWELL';
      return 'CONTACT_COLLECTION';
    case 'FAREWELL':
      return 'FAREWELL';
    default:
      return current;
  }
}

/**
 * 核心：基于当前状态和意图生成回复
 */
export function generateResponse(
  currentState: MainDialogState,
  exceptionState: ExceptionState,
  slots: CollectedSlots,
  intentResult: IntentResult,
  _dialogHistory: Array<{ role: string; content: string }>
): AgentResponse {
  const { intent, entities } = intentResult;
  const newSlots = { ...slots };
  let reasoning = '';
  let action = '';
  let reply = '';
  let nextState = currentState;
  let nextException: ExceptionState = 'NONE';

  // === 护栏优先处理 ===

  // 辱骂处理
  if (intent === 'abuse') {
    reasoning = '检测到辱骂/攻击性语言，触发护栏机制';
    action = 'check_guardrail → 礼貌退出';
    reply = '不好意思打扰了，祝您生活愉快，再见。';
    nextState = 'FAREWELL';
    nextException = 'ABUSE';
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // 反感处理
  if (intent === 'dislike') {
    reasoning = '检测到客户强烈反感，触发护栏机制';
    action = 'check_guardrail → 理解并退出';
    reply = '理解您的感受，那就不打扰了，如果有需要随时联系我们。祝您生活愉快！';
    nextState = 'FAREWELL';
    nextException = 'ABUSE';
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // === 实体收集（无论什么状态都先收集实体） ===
  // 否定意图下客户提到的品牌/车系不是真实意向，不收集（防误收集/防覆盖已确认信息）
  if (intent !== 'disagree') {
    if (entities.brand) newSlots.brand = entities.brand;
    if (entities.series) {
      newSlots.series = entities.series;
      if (!newSlots.brand) {
        // 从车型推断品牌
        for (const [brandName, brandData] of Object.entries(knowledgeBase.brands)) {
          if (Object.keys(brandData.series).includes(entities.series)) {
            newSlots.brand = brandName;
            break;
          }
        }
      }
    }
    if (entities.city) newSlots.city = entities.city;
    if (entities.timing) newSlots.timing = entities.timing;
    if (entities.surname) newSlots.surname = entities.surname;
    if (entities.phoneTail) newSlots.phoneTail = entities.phoneTail;
    if (entities.vehicleType) newSlots.vehicleType = entities.vehicleType;
    if (entities.powerType) newSlots.powerType = entities.powerType;
  }

  // === 根据当前状态处理 ===

  // GREETING 状态
  if (currentState === 'GREETING') {
    if (intent === 'greet' || intent === 'agree') {
      reasoning = '客户回应问候，开始进入营销流程';
      action = '推进到 BRAND_INQUIRY';
      reply = '价格合适的话，您这边考虑过买车吗？给您做一个报价，您参考了解一下哈，您看最近有比较关注哪款车呀？';
      nextState = 'BRAND_INQUIRY';
    } else if (intent !== 'disagree' && (intent === 'confirm_brand' || entities.brand)) {
      reasoning = '客户直接说出品牌，跳过品牌确认';
      action = 'query_vehicle_kb → 推进到 MODEL_INQUIRY';
      const kbResult = queryVehicleKB({ brand: newSlots.brand || entities.brand });
      if (kbResult.found) {
        const seriesNames = kbResult.results.map((r) => r.name);
        reply = `好的，${newSlots.brand}有${seriesNames.join('、')}，您看您想了解哪款车呢？`;
      } else {
        reply = `好的，您关注${newSlots.brand}是吧，帮您查一下。您想了解哪款车呢？`;
      }
      nextState = 'MODEL_INQUIRY';
    } else if (intent !== 'disagree' && (intent === 'confirm_model' || entities.series)) {
      reasoning = '客户直接说出车型';
      action = '推进到 CITY_INQUIRY';
      reply = `${entities.series}可以的，想了解哪个城市的价格呢？在哪个城市看车购车方便呀？`;
      nextState = 'CITY_INQUIRY';
    } else if (intent === 'disagree') {
      reasoning = '客户表示不考虑买车';
      action = '柔性挽留';
      reply = '没关系的，买不买都没关系，先了解一下价格做个参考也好嘛。您最近有关注什么车吗？';
      nextState = 'BRAND_INQUIRY';
    } else if (intent === 'off_track' || intent === 'unknown') {
      reasoning = '客户回应不明确或偏离';
      action = '引导回营销流程';
      reply = '是这样的，我们这边可以帮您做一个新车的报价，您参考了解一下。您最近有关注什么车吗？';
      nextState = 'BRAND_INQUIRY';
    } else {
      reasoning = '客户输入无法明确识别';
      action = '澄清并引导';
      reply = '嗯，这边是互联网汽车营销中心的，想问下您最近有考虑买车吗？有关注什么车吗？';
      nextState = 'BRAND_INQUIRY';
    }
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // BRAND_INQUIRY 状态
  if (currentState === 'BRAND_INQUIRY') {
    if (intent !== 'disagree' && (intent === 'confirm_brand' || entities.brand)) {
      reasoning = `客户确认品牌：${newSlots.brand}`;
      action = 'query_vehicle_kb → 推进到 MODEL_INQUIRY';
      const kbResult = queryVehicleKB({ brand: newSlots.brand! });
      if (kbResult.found) {
        const seriesNames = kbResult.results.map((r) => r.name);
        reply = `好的，帮您查询一下。${newSlots.brand}有${seriesNames.join('、')}，您看您想了解哪款车呢？`;
      } else {
        reply = `${newSlots.brand}是吧，好的。不过目前这个品牌的信息可能不太全，您有其他关注的品牌吗？`;
      }
      nextState = 'MODEL_INQUIRY';
    } else if (intent === 'disagree') {
      // 对应老系统“挽回1”：客户否定/暂无意向时柔性挽留
      reasoning = '客户否定/暂无明确意向';
      action = '柔性挽留（挽回1）';
      reply = '没关系的，买车不着急，先了解一下价格做个参考也好。您最近有关注什么品牌或车型吗？';
      nextState = 'BRAND_INQUIRY';
    } else if (intent === 'ask_recommend') {
      reasoning = '客户请求推荐';
      action = '引导选择品牌';
      reply = '现在比较热门的有蔚来、比亚迪、理想、特斯拉、小鹏这些品牌，您有比较倾向哪个吗？';
      nextState = 'BRAND_INQUIRY';
    } else if (intent === 'filter_vehicle' && (entities.vehicleType || entities.powerType)) {
      reasoning = '客户用类型/动力描述需求，但还没确定品牌';
      action = '引导先选品牌';
      reply = '好的，您想看' +
        (entities.powerType || '') +
        (entities.vehicleType || '') +
        '，请问您比较关注哪个品牌呢？不同品牌的' +
        (entities.vehicleType || '车型') +
        '选择不太一样。';
      nextState = 'BRAND_INQUIRY';
    } else if (intent === 'agree') {
      reasoning = '客户表示同意但没有给出品牌';
      action = '追问品牌';
      if (newSlots.brand) {
        // 品牌已确认 → 不回问，推进到车型
        reasoning = '品牌已确认，推进到车型选择';
        action = '推进到 MODEL_INQUIRY';
        reply = getCurrentQuestion('MODEL_INQUIRY', newSlots);
        nextState = 'MODEL_INQUIRY';
      } else {
        reply = '那您最近有关注哪个品牌的车吗？';
        nextState = 'BRAND_INQUIRY';
      }
    } else if (intent === 'off_track') {
      reasoning = '客户偏离话题';
      action = '柔性拉回';
      nextException = 'OFF_TRACK';
      reply = '嗯嗯，那回到买车这件事，您最近有关注什么品牌或车型吗？';
      nextState = 'BRAND_INQUIRY';
    } else {
      reasoning = '无法识别客户意图';
      action = '澄清追问';
      nextException = 'UNCLEAR';
      reply = '不好意思没太听清，您是说想了解哪个品牌的车呢？';
      nextState = 'BRAND_INQUIRY';
    }
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // MODEL_INQUIRY 状态
  if (currentState === 'MODEL_INQUIRY') {
    if (intent !== 'disagree' && (intent === 'confirm_model' || entities.series)) {
      reasoning = `客户确认车型：${newSlots.series}`;
      action = '推进到 CITY_INQUIRY';
      reply = `${newSlots.series}可以的，想了解哪个城市的价格呢？在哪个城市看车购车方便呀？`;
      nextState = 'CITY_INQUIRY';
    } else if (intent === 'filter_vehicle' && newSlots.brand && (entities.vehicleType || entities.powerType)) {
      // 知识库仅品牌+车系（无类型/动力字段），类型描述不再筛选，列出品牌全部车系供选择
      reasoning = `客户用${entities.powerType || ''}${entities.vehicleType || ''}描述需求，知识库无类型字段，列出${newSlots.brand}全部车系`;
      action = 'query_vehicle_kb → 展示全部车系';
      const kbResult = queryVehicleKB({ brand: newSlots.brand });
      const names = (kbResult.found ? kbResult.results : []).map((r) => r.name);
      if (names.length > 0) {
        reply = `${newSlots.brand}的话，有${names.join('、')}，您看您想了解哪款车呢？`;
      } else {
        reply = `好的，您关注${newSlots.brand}是吧，帮您查一下。您想了解哪款车呢？`;
      }
      nextState = 'MODEL_INQUIRY';
    } else if (intent === 'ask_recommend') {
      reasoning = '客户请求推荐车型';
      action = '展示品牌车型列表';
      if (newSlots.brand) {
        const series = getBrandSeries(newSlots.brand);
        reply = `${newSlots.brand}的话，有${series.join('、')}，您看您想了解哪款车呢？`;
      } else {
        reply = '您比较看重哪方面呢？比如空间大的SUV，还是操控好的轿车？';
      }
      nextState = 'MODEL_INQUIRY';
    } else if (intent === 'ask_vehicle') {
      reasoning = '客户询问有哪些车';
      action = '展示车型列表';
      if (newSlots.brand) {
        const series = getBrandSeries(newSlots.brand);
        reply = `${newSlots.brand}有${series.join('、')}，您看您想了解哪款车呢？`;
      }
      nextState = 'MODEL_INQUIRY';
    } else if (intent === 'out_of_scope') {
      reasoning = '客户问超范围问题（价格/配置等）';
      action = '承认局限+引导继续流程';
      nextException = 'OUT_OF_SCOPE';
      reply = '具体的信息我帮您对接当地四S店给您详细介绍，先帮您确认下基本信息哈。您看选哪款车呢？';
      nextState = 'MODEL_INQUIRY';
    } else if (intent === 'confirm_brand' && entities.brand && entities.brand !== newSlots.brand) {
      reasoning = `客户切换品牌到${entities.brand}`;
      action = 'query_vehicle_kb → 更新品牌';
      newSlots.brand = entities.brand;
      newSlots.series = null;
      const kbResult = queryVehicleKB({ brand: newSlots.brand });
      if (kbResult.found) {
        const seriesNames = kbResult.results.map((r) => r.name);
        reply = `好的，${newSlots.brand}有${seriesNames.join('、')}，您看您想了解哪款车呢？`;
      } else {
        reply = `好的，${newSlots.brand}。您想了解哪款车呢？`;
      }
      nextState = 'MODEL_INQUIRY';
    } else if (intent === 'agree') {
      reasoning = '客户同意但没有指定车型';
      action = '追问具体车型';
      if (newSlots.series) {
        // 车系已确认 → 不回问，推进到城市
        reasoning = '车系已确认，推进到城市确认';
        action = '推进到 CITY_INQUIRY';
        reply = getCurrentQuestion('CITY_INQUIRY', newSlots);
        nextState = 'CITY_INQUIRY';
      } else if (newSlots.brand) {
        const series = getBrandSeries(newSlots.brand);
        reply = `那您看选哪款呢？${series.join('、')}，您看选哪个？`;
      } else {
        reply = '您看具体想了解哪款车呢？';
      }
    } else if (intent === 'off_track') {
      reasoning = '客户偏离话题';
      action = '柔性拉回';
      nextException = 'OFF_TRACK';
      if (newSlots.brand) {
        const series = getBrandSeries(newSlots.brand);
        reply = `嗯嗯，那咱们继续，${newSlots.brand}有${series.join('、')}，您看选哪款呢？`;
      } else {
        reply = '嗯嗯，那您看想了解哪款车呢？';
      }
      nextState = 'MODEL_INQUIRY';
    } else {
      reasoning = '无法识别客户意图';
      action = '澄清追问';
      nextException = 'UNCLEAR';
      reply = '不好意思没太听清，您是想了解哪款车呢？';
      nextState = 'MODEL_INQUIRY';
    }
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // CITY_INQUIRY 状态
  if (currentState === 'CITY_INQUIRY') {
    if (intent !== 'disagree' && (intent === 'confirm_city' || entities.city)) {
      reasoning = `客户确认城市：${newSlots.city}`;
      action = '推进到 TIMING_INQUIRY';
      reply = `${newSlots.city}是吧？考虑什么时候购车呀？有大概时间吗？`;
      nextState = 'TIMING_INQUIRY';
    } else if (intent === 'out_of_scope') {
      reasoning = '客户问超范围问题';
      action = '承认局限+引导继续流程';
      nextException = 'OUT_OF_SCOPE';
      reply = '具体价格我帮您对接当地四S店给您精准报价，先帮您确认下基本信息哈。您看在哪个城市看车购车方便呀？';
      nextState = 'CITY_INQUIRY';
    } else if (intent === 'agree') {
      reasoning = '客户同意但没给出城市';
      action = '追问城市';
      if (newSlots.city) {
        // 城市已确认 → 不回问，推进到时间
        reasoning = '城市已确认，推进到购车时间';
        action = '推进到 TIMING_INQUIRY';
        reply = getCurrentQuestion('TIMING_INQUIRY', newSlots);
        nextState = 'TIMING_INQUIRY';
      } else {
        reply = '那您在哪个城市看车购车方便呀？';
        nextState = 'CITY_INQUIRY';
      }
    } else if (intent === 'off_track') {
      reasoning = '客户偏离话题';
      action = '柔性拉回';
      nextException = 'OFF_TRACK';
      reply = '嗯嗯，那您看在哪个城市看车购车方便呀？';
      nextState = 'CITY_INQUIRY';
    } else {
      reasoning = '无法识别';
      action = '澄清追问';
      nextException = 'UNCLEAR';
      reply = '不好意思没太听清，您是在哪个城市看车购车呀？';
      nextState = 'CITY_INQUIRY';
    }
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // TIMING_INQUIRY 状态
  if (currentState === 'TIMING_INQUIRY') {
    if (intent !== 'disagree' && (intent === 'confirm_time' || entities.timing)) {
      reasoning = `客户确认购车时间：${newSlots.timing}`;
      action = '推进到 CONTACT_COLLECTION';
      const modelInfo = newSlots.series
        ? `${newSlots.series}${newSlots.city ? `在${newSlots.city}` : ''}的最新底价`
        : '报价信息';
      reply = `好的，那稍后将您信息授权合作伙伴当地四S店给您提供精准落地价，您保持手机畅通，听一下${modelInfo}，参考下价格好吧。您贵姓啊？`;
      nextState = 'CONTACT_COLLECTION';
    } else if (intent === 'out_of_scope') {
      reasoning = '客户问超范围问题';
      action = '承认局限+引导继续流程';
      nextException = 'OUT_OF_SCOPE';
      reply = '具体的我帮您对接四S店了解，先确认下基本信息。您考虑什么时候购车呀？';
      nextState = 'TIMING_INQUIRY';
    } else if (intent === 'agree') {
      reasoning = '客户同意但没给出时间';
      action = '追问时间';
      if (newSlots.timing) {
        // 时间已确认 → 不回问，推进到联系方式
        reasoning = '时间已确认，推进到联系方式收集';
        action = '推进到 CONTACT_COLLECTION';
        reply = getCurrentQuestion('CONTACT_COLLECTION', newSlots);
        nextState = 'CONTACT_COLLECTION';
      } else {
        reply = '那您大概考虑什么时候购车呢？';
        nextState = 'TIMING_INQUIRY';
      }
    } else if (intent === 'off_track') {
      reasoning = '客户偏离话题';
      action = '柔性拉回';
      nextException = 'OFF_TRACK';
      reply = '嗯嗯，那您大概考虑什么时候购车呢？';
      nextState = 'TIMING_INQUIRY';
    } else {
      reasoning = '无法识别';
      action = '澄清追问';
      nextException = 'UNCLEAR';
      reply = '不好意思没太听清，您考虑什么时候购车呀？';
      nextState = 'TIMING_INQUIRY';
    }
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // CONTACT_COLLECTION 状态
  if (currentState === 'CONTACT_COLLECTION') {
    if (intent !== 'disagree' && (intent === 'confirm_surname' || entities.surname)) {
      reasoning = `客户确认姓氏：${newSlots.surname}`;
      action = '推进到 FAREWELL';
      const title = newSlots.surname;
      const modelDesc = newSlots.series
        ? `${newSlots.series}${newSlots.city ? `在${newSlots.city}` : ''}`
        : '报价';
      reply = `${title}您好${newSlots.series ? `，稍后报价，早日提爱车` : '，稍后会有专人联系您'}，再见。`;
      nextState = 'FAREWELL';
    } else if (intent === 'out_of_scope') {
      reasoning = '客户问超范围问题';
      action = '承认局限+引导继续流程';
      nextException = 'OUT_OF_SCOPE';
      reply = '好的，这些四S店的专业顾问会给您详细介绍的。请问您贵姓啊？';
      nextState = 'CONTACT_COLLECTION';
    } else if (intent === 'off_track') {
      reasoning = '客户偏离话题';
      action = '柔性拉回';
      nextException = 'OFF_TRACK';
      reply = '嗯嗯，那请问您贵姓啊？';
      nextState = 'CONTACT_COLLECTION';
    } else if (intent === 'agree') {
      reasoning = '客户同意但没给出姓氏';
      action = '追问姓氏';
      if (newSlots.surname) {
        // 姓氏已确认 → 信息闭环，推进结束
        reasoning = '姓氏已确认，信息闭环';
        action = '推进到 FAREWELL';
        reply = getCurrentQuestion('CONTACT_COLLECTION', newSlots);
        nextState = 'FAREWELL';
      } else {
        reply = '那请问您贵姓啊？';
        nextState = 'CONTACT_COLLECTION';
      }
    } else {
      reasoning = '无法识别';
      action = '澄清追问';
      nextException = 'UNCLEAR';
      reply = '不好意思没太听清，请问您贵姓啊？';
      nextState = 'CONTACT_COLLECTION';
    }
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // FAREWELL 状态
  if (currentState === 'FAREWELL') {
    reasoning = '对话已结束';
    action = '保持结束状态';
    reply = '感谢您的时间，祝您生活愉快，再见！';
    nextState = 'FAREWELL';
    return { reply, nextState, nextException, updatedSlots: newSlots, reasoning, action };
  }

  // 默认兜底
  reasoning = '未匹配到任何状态处理逻辑';
  action = '兜底回复';
  reply = '嗯，您看还有什么想了解的吗？';
  return { reply, nextState: currentState, nextException, updatedSlots: newSlots, reasoning, action };
}
