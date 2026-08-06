import type { KnowledgeBase, QueryParams, QueryResult, SeriesInfo } from './types';
import { vehicleBrandSeries } from './vehicle-brands.generated';

// 品牌归一化：xlsx 与命名不一致时合并为同一品牌（'理想汽车' 在 xlsx、'理想' 在手写表）
const brandMerges: Record<string, string> = {
  '理想汽车': '理想',
};

// 知识库最小实现：仅品牌+车系两级数据，无车身类型/动力/价格附加字段
//（这些字段已从知识库移除——LLM 看到动力/价格信息会过度询问，如"看燃油版还是新能源"）
const EMPTY_SERIES: SeriesInfo = { type: '未知', power: '未知', priceRange: '未知' };

// 手写补充车系：xlsx 未收录的真实车系名（仅车系名，无附加字段）
const manualSeries: Record<string, string[]> = {
  '蔚来': ['ES7'],
  '比亚迪': ['宋'],
};

// 合并 xlsx 车型库（vehicle-brands.generated.ts）与手写补充车系：
// 品牌全集 = xlsx 品牌（含归一化合并）；车系名由生成脚本统一去品牌前缀
function buildKnowledgeBase(): KnowledgeBase {
  const brands: KnowledgeBase['brands'] = {};
  for (const [rawBrand, seriesList] of Object.entries(vehicleBrandSeries)) {
    const brand = brandMerges[rawBrand] || rawBrand;
    const series: Record<string, SeriesInfo> = brands[brand]?.series || {};
    for (const name of seriesList) {
      series[name] = EMPTY_SERIES;
    }
    brands[brand] = { series };
  }
  for (const [brand, seriesList] of Object.entries(manualSeries)) {
    const series: Record<string, SeriesInfo> = (brands[brand] = brands[brand] || { series: {} }).series;
    for (const name of seriesList) {
      series[name] = EMPTY_SERIES;
    }
  }
  return { brands };
}

// 车辆知识库数据
export const knowledgeBase: KnowledgeBase = buildKnowledgeBase();

// 品牌别名映射
const brandAliases: Record<string, string> = {
  '蔚莱': '蔚来',
  'weiwei': '蔚来',
  'NIO': '蔚来',
  'nio': '蔚来',
  'byd': '比亚迪',
  '比亚帝': '比亚迪',
  '理想one': '理想',
  'li': '理想',
  'tesla': '特斯拉',
  '特死拉': '特斯拉',
  'xpeng': '小鹏',
};

// 车身类型别名
const typeAliases: Record<string, string> = {
  '越野': 'SUV',
  '越野车': 'SUV',
  'suv': 'SUV',
  'SUV': 'SUV',
  '轿车': '轿车',
  '小轿车': '轿车',
  '房车': '轿车',
  'mpv': 'MPV',
  'MPV': 'MPV',
  '商务车': 'MPV',
  '面包车': 'MPV',
  '七座': 'SUV',
  '7座': 'SUV',
  '大车': 'SUV',
  '小车': '轿车',
};

// 动力类型别名
const powerAliases: Record<string, string> = {
  '纯电': '纯电',
  '电动': '纯电',
  '电车': '纯电',
  '混动': '混动',
  '混合动力': '混动',
  '油电混合': '混动',
  '插混': '混动',
  '增程': '增程',
  '增程式': '增程',
  '燃油': '燃油',
  '油车': '燃油',
  '汽油': '燃油',
};

/**
 * 查询知识库（最小实现：仅品牌→车系两级，无类型/动力/价格筛选）
 * type/power 参数保留兼容调用方，但知识库已无附加字段，筛选不再生效
 */
export function queryVehicleKB(params: QueryParams): QueryResult {
  const { brand } = params;

  // 解析品牌名
  const resolvedBrand = resolveBrand(brand || '');

  if (resolvedBrand) {
    const brandData = knowledgeBase.brands[resolvedBrand];
    if (!brandData) {
      return {
        found: false,
        brand: resolvedBrand,
        results: [],
        message: `抱歉，目前知识库中暂时没有${resolvedBrand}的信息`,
      };
    }

    const seriesList = Object.entries(brandData.series).map(([name, info]) => ({
      name,
      type: info.type,
      power: info.power,
      priceRange: info.priceRange,
    }));

    return {
      found: true,
      brand: resolvedBrand,
      results: seriesList,
    };
  }

  // 明确提供了品牌但知识库中不存在 → 返回带品牌名的友好提示
  if (brand) {
    return {
      found: false,
      brand,
      results: [],
      message: `抱歉，目前知识库中暂时没有${brand}的信息`,
    };
  }

  return { found: false, results: [], message: '请提供更多信息' };
}

/**
 * 解析品牌名（支持别名和模糊匹配）
 */
export function resolveBrand(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 直接匹配
  if (knowledgeBase.brands[trimmed]) return trimmed;

  // 别名匹配
  if (brandAliases[trimmed]) return brandAliases[trimmed];

  // 模糊匹配（包含关系）
  for (const brandName of Object.keys(knowledgeBase.brands)) {
    if (trimmed.includes(brandName) || brandName.includes(trimmed)) {
      return brandName;
    }
  }

  // 别名模糊匹配
  for (const [alias, brandName] of Object.entries(brandAliases)) {
    if (trimmed.includes(alias) || alias.includes(trimmed)) {
      return brandName;
    }
  }

  return null;
}

/**
 * 解析车身类型
 */
export function resolveType(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  if (typeAliases[trimmed]) return typeAliases[trimmed];

  for (const [alias, type] of Object.entries(typeAliases)) {
    if (trimmed.includes(alias) || alias.includes(trimmed)) {
      return type;
    }
  }

  return null;
}

/**
 * 解析动力类型
 */
export function resolvePower(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  if (powerAliases[trimmed]) return powerAliases[trimmed];

  for (const [alias, power] of Object.entries(powerAliases)) {
    if (trimmed.includes(alias) || alias.includes(trimmed)) {
      return power;
    }
  }

  return null;
}

/**
 * 获取品牌下的所有车系列表
 */
export function getBrandSeries(brand: string): string[] {
  const resolved = resolveBrand(brand);
  if (!resolved) return [];
  return Object.keys(knowledgeBase.brands[resolved]?.series || {});
}

/**
 * 获取所有支持的品牌
 */
export function getAllBrands(): string[] {
  return Object.keys(knowledgeBase.brands);
}
