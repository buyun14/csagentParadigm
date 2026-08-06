import { describe, it, expect } from 'vitest';
import { queryVehicleKB, resolveBrand, resolveType, resolvePower, getBrandSeries, getAllBrands } from './knowledge-base';

describe('knowledge-base 知识库查询', () => {
  it('品牌精确匹配', () => {
    expect(resolveBrand('蔚来')).toBe('蔚来');
  });

  it('品牌别名匹配', () => {
    expect(resolveBrand('NIO')).toBe('蔚来');
    expect(resolveBrand('byd')).toBe('比亚迪');
  });

  it('品牌模糊匹配（包含关系）', () => {
    expect(resolveBrand('我想看理想汽车')).toBe('理想');
  });

  it('车身类型别名', () => {
    expect(resolveType('越野车')).toBe('SUV');
    expect(resolveType('商务车')).toBe('MPV');
  });

  it('动力类型别名', () => {
    expect(resolvePower('电车')).toBe('纯电');
    expect(resolvePower('油电混合')).toBe('混动');
  });

  it('品牌下所有车系', () => {
    const series = getBrandSeries('特斯拉');
    expect(series).toContain('Model 3');
    expect(series).toContain('Model Y');
  });

  it('手写独有车系在合并后保留（xlsx 无 ES7/宋）', () => {
    expect(getBrandSeries('蔚来')).toContain('ES7');
    expect(getBrandSeries('比亚迪')).toContain('宋');
    // xlsx 新增车系（蔚来 ET9）也进入知识库
    expect(getBrandSeries('蔚来')).toContain('ET9');
  });

  it('xlsx 品牌归一化合并（理想汽车 → 理想）', () => {
    const brands = getAllBrands();
    expect(brands).not.toContain('理想汽车');
    const series = getBrandSeries('理想');
    // xlsx 独有车系 i8 与手写车系 L7 均存在
    expect(series).toContain('i8');
    expect(series).toContain('L7');
    // 模糊匹配仍解析到理想
    expect(resolveBrand('我想看理想汽车')).toBe('理想');
  });

  it('所有品牌列表', () => {
    const brands = getAllBrands();
    expect(brands).toEqual(expect.arrayContaining(['蔚来', '比亚迪', '理想', '特斯拉', '小鹏']));
  });

  it('按品牌查询返回车系列表', () => {
    const r = queryVehicleKB({ brand: '蔚来' });
    expect(r.found).toBe(true);
    expect(r.brand).toBe('蔚来');
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results[0]).toHaveProperty('priceRange');
  });

  it('按品牌+车身类型筛选（知识库无附加字段，筛选不再生效，返回全部车系）', () => {
    const r = queryVehicleKB({ brand: '蔚来', type: 'SUV' });
    // type/power 参数兼容保留但被忽略，返回品牌全部车系
    expect(r.found).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.every((x) => x.type === '未知')).toBe(true);
  });

  it('不存在的品牌 → 友好 message', () => {
    const r = queryVehicleKB({ brand: '迈巴赫' });
    expect(r.found).toBe(false);
    expect(r.message).toContain('迈巴赫');
  });

  it('无品牌+类型 → 提示提供更多信息（全局搜索已随附加字段移除）', () => {
    const r = queryVehicleKB({ type: 'MPV' });
    expect(r.found).toBe(false);
    expect(r.message).toContain('更多信息');
  });

  it('无任何条件 → 提示提供更多信息', () => {
    const r = queryVehicleKB({});
    expect(r.found).toBe(false);
    expect(r.message).toContain('更多信息');
  });
});
