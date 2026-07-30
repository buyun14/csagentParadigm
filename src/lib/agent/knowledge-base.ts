import type { KnowledgeBase, QueryParams, QueryResult } from './types';

// 车辆知识库数据
export const knowledgeBase: KnowledgeBase = {
  brands: {
    '蔚来': {
      series: {
        'ET5': { type: '轿车', power: '纯电', priceRange: '25-30万' },
        'ET7': { type: '轿车', power: '纯电', priceRange: '40-50万' },
        'ES6': { type: 'SUV', power: '纯电', priceRange: '30-40万' },
        'ES7': { type: 'SUV', power: '纯电', priceRange: '40-50万' },
        'ES8': { type: 'SUV', power: '纯电', priceRange: '50-60万' },
        'EC6': { type: 'SUV', power: '纯电', priceRange: '35-45万' },
      },
    },
    '比亚迪': {
      series: {
        '汉': { type: '轿车', power: '混动/纯电', priceRange: '20-30万' },
        '秦': { type: '轿车', power: '混动/纯电', priceRange: '10-15万' },
        '宋': { type: 'SUV', power: '混动/纯电', priceRange: '15-20万' },
        '唐': { type: 'SUV', power: '混动/纯电', priceRange: '25-35万' },
        '海豚': { type: '轿车', power: '纯电', priceRange: '10-13万' },
      },
    },
    '理想': {
      series: {
        'L7': { type: 'SUV', power: '增程', priceRange: '30-35万' },
        'L8': { type: 'SUV', power: '增程', priceRange: '35-40万' },
        'L9': { type: 'SUV', power: '增程', priceRange: '45-50万' },
        'MEGA': { type: 'MPV', power: '纯电', priceRange: '55-60万' },
      },
    },
    '特斯拉': {
      series: {
        'Model 3': { type: '轿车', power: '纯电', priceRange: '23-30万' },
        'Model Y': { type: 'SUV', power: '纯电', priceRange: '26-35万' },
        'Model S': { type: '轿车', power: '纯电', priceRange: '70-100万' },
        'Model X': { type: 'SUV', power: '纯电', priceRange: '80-100万' },
      },
    },
    '小鹏': {
      series: {
        'P7': { type: '轿车', power: '纯电', priceRange: '20-30万' },
        'G6': { type: 'SUV', power: '纯电', priceRange: '20-25万' },
        'G9': { type: 'SUV', power: '纯电', priceRange: '30-40万' },
        'X9': { type: 'MPV', power: '纯电', priceRange: '35-40万' },
      },
    },
  },
};

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
 * 查询知识库
 */
export function queryVehicleKB(params: QueryParams): QueryResult {
  const { brand, type, power } = params;

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

    let seriesList = Object.entries(brandData.series).map(([name, info]) => ({
      name,
      type: info.type,
      power: info.power,
      priceRange: info.priceRange,
    }));

    // 按车身类型筛选
    if (type) {
      const resolvedType = resolveType(type);
      if (resolvedType) {
        seriesList = seriesList.filter((s) => s.type === resolvedType);
      }
    }

    // 按动力类型筛选
    if (power) {
      const resolvedPower = resolvePower(power);
      if (resolvedPower) {
        seriesList = seriesList.filter((s) =>
          s.power.includes(resolvedPower)
        );
      }
    }

    if (seriesList.length === 0) {
      const filters: string[] = [];
      if (type) filters.push(resolveType(type) || type);
      if (power) filters.push(resolvePower(power) || power);
      return {
        found: false,
        brand: resolvedBrand,
        results: [],
        message: `${resolvedBrand}目前没有${filters.join('且')}的车型`,
      };
    }

    return {
      found: true,
      brand: resolvedBrand,
      results: seriesList,
    };
  }

  // 没有品牌，按类型/动力全局搜索
  if (type || power) {
    const results: QueryResult['results'] = [];
    const resolvedType = type ? resolveType(type) : undefined;
    const resolvedPower = power ? resolvePower(power) : undefined;

    for (const [brandName, brandData] of Object.entries(
      knowledgeBase.brands
    )) {
      for (const [seriesName, info] of Object.entries(brandData.series)) {
        let match = true;
        if (resolvedType && info.type !== resolvedType) match = false;
        if (resolvedPower && !info.power.includes(resolvedPower))
          match = false;
        if (match) {
          results.push({
            name: `${brandName} ${seriesName}`,
            type: info.type,
            power: info.power,
            priceRange: info.priceRange,
          });
        }
      }
    }

    return {
      found: results.length > 0,
      results,
      message:
        results.length > 0
          ? undefined
          : '没有找到符合条件的车型',
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
