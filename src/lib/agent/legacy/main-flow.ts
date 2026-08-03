import type { LegacyFlow } from './legacy-types';

/**
 * 老系统主流程数据（由 scripts/import-legacy.mjs 生成，勿手改）
 * 15 个子流程，按 sort 升序：开场白 → 其他购车相关问题 → 其他非相关问题 → 挽回1 →
 * 询问关注品牌 → 询问关注车系 → 预计购车时间 → 询问客户姓氏 → 询问所在地区 →
 * 信息授权确认 → 成功结束 → 失败挂机 → 无声挂机 → 二手车 → 性别采集
 */
export const legacyMainFlows: LegacyFlow[] = [
  {
    "botId": 100010,
    "name": "开场白",
    "sort": 1,
    "uuid": "12e0a5ac263845e9bc5bcb6ad2d332f8",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "开场白",
        "type": "defaultNode",
        "content": "诶您好，我是互联网汽车营销中心的，这里给您做一个报价哈，您可以先参考了解一下，请问您近期是否有购车的打算，或者是比较关注哪款车型呢？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 挽回1",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问关注车系",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 预计购车时间",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问关注品牌",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "问候语",
        "type": "defaultNode",
        "content": "喂您好？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "兜底",
        "type": "defaultNode",
        "content": "这里是互联网汽车营销中心，如果价格合适的话您考虑买车吗？给您做个报价您参考了解一下，请问您关注哪款车呀？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 其他购车相关问题",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "挽回1",
      "询问关注车系",
      "预计购车时间",
      "询问关注品牌",
      "其他购车相关问题"
    ],
    "speechNodes": [
      {
        "title": "开场白",
        "content": "诶您好，我是互联网汽车营销中心的，这里给您做一个报价哈，您可以先参考了解一下，请问您近期是否有购车的打算，或者是比较关注哪款车型呢？"
      },
      {
        "title": "问候语",
        "content": "喂您好？"
      },
      {
        "title": "兜底",
        "content": "这里是互联网汽车营销中心，如果价格合适的话您考虑买车吗？给您做个报价您参考了解一下，请问您关注哪款车呀？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "其他购车相关问题",
    "sort": 2,
    "uuid": "1a63073a-8b1d-11f1-a3ad-0050568395f8",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "其他购车相关问题",
        "type": "defaultNode",
        "content": "哦，好的，帮您记录需求了。",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 预计购车时间",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "预计购车时间"
    ],
    "speechNodes": [
      {
        "title": "其他购车相关问题",
        "content": "哦，好的，帮您记录需求了。"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "其他非相关问题",
    "sort": 3,
    "uuid": "5fe62d88-8b33-11f1-a3ad-0050568395f8",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 失败挂机",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "普通节点",
        "type": "defaultNode",
        "content": "恒抱歉打扰您了，再见。",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "失败挂机"
    ],
    "speechNodes": [
      {
        "title": "普通节点",
        "content": "恒抱歉打扰您了，再见。"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "挽回1",
    "sort": 4,
    "uuid": "dd9154e34c3e4e929fbe670cca464e83",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "挽回1",
        "type": "defaultNode",
        "content": "您如果最近在看车，可以做个参考，我们这个活动优惠是平台提供的，在门店报价以外的，只要是是我们合作的品牌都可以享受，您这边在关注哪个品牌呢？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问关注品牌",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 失败挂机",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问关注车系",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 预计购车时间",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "询问关注品牌",
      "失败挂机",
      "询问关注车系",
      "预计购车时间"
    ],
    "speechNodes": [
      {
        "title": "挽回1",
        "content": "您如果最近在看车，可以做个参考，我们这个活动优惠是平台提供的，在门店报价以外的，只要是是我们合作的品牌都可以享受，您这边在关注哪个品牌呢？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "询问关注品牌",
    "sort": 5,
    "uuid": "6a69b6109e814c5d8ae214f8ce540eb9",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "询问汽车品牌",
        "type": "defaultNode",
        "content": "嗯，您最近在关注哪个品牌的哪款车呀？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 失败挂机",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 预计购车时间",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问关注车系",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问关注车系",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "失败挂机",
      "预计购车时间",
      "询问关注车系",
      "询问关注车系"
    ],
    "speechNodes": [
      {
        "title": "询问汽车品牌",
        "content": "嗯，您最近在关注哪个品牌的哪款车呀？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "询问关注车系",
    "sort": 6,
    "uuid": "2343fd571a80457dbd8af6f99a1e8606",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "询问关注车系",
        "type": "defaultNode",
        "content": "呃，那具体是哪个车系呢?",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 预计购车时间",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 预计购车时间",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "预计购车时间",
      "预计购车时间"
    ],
    "speechNodes": [
      {
        "title": "询问关注车系",
        "content": "呃，那具体是哪个车系呢?"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "预计购车时间",
    "sort": 7,
    "uuid": "f5181ab50735432d9026afe255a92bab",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "预计购车时间",
        "type": "defaultNode",
        "content": "如果价格合适的话，您预计会在一个月、三个月还是半年内有购车打算呢？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问所在地区",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问所在地区",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "询问所在地区",
      "询问所在地区"
    ],
    "speechNodes": [
      {
        "title": "预计购车时间",
        "content": "如果价格合适的话，您预计会在一个月、三个月还是半年内有购车打算呢？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "询问客户姓氏",
    "sort": 8,
    "uuid": "8fd6cd363b5043a8b059f032f7820d62",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "询问姓氏",
        "type": "defaultNode",
        "content": "那怎么称呼您呀？我姓张，请问您贵姓呢？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 成功结束",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "成功结束"
    ],
    "speechNodes": [
      {
        "title": "询问姓氏",
        "content": "那怎么称呼您呀？我姓张，请问您贵姓呢？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "询问所在地区",
    "sort": 9,
    "uuid": "e032c60d56fe437faf57c4c87d5d474b",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "询问所在地区",
        "type": "defaultNode",
        "content": "那您在哪个城市看车方便，给您查询您当地的底价。",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "好的，稍后我们会将购车信息提供给汽车之家、易车及其他平台，平台会协调您意向车辆的品牌厂商为您提供报价，",
        "next": "指定主流程 / 信息授权确认",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "普通节点",
        "type": "defaultNode",
        "content": "嗯不同城市的优惠政策不太一样。我们给您算一个当地的底价，您看您是打算在哪个城市买车呢？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "普通节点",
        "type": "defaultNode",
        "content": "嗯，不同城市的经销商呢可能都会有不同的优惠。我们也是希望能给到您最好的服务嘛。您看您主要是在哪个城市呢？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "信息授权确认"
    ],
    "speechNodes": [
      {
        "title": "询问所在地区",
        "content": "那您在哪个城市看车方便，给您查询您当地的底价。"
      },
      {
        "title": "跳转节点",
        "content": "好的，稍后我们会将购车信息提供给汽车之家、易车及其他平台，平台会协调您意向车辆的品牌厂商为您提供报价，"
      },
      {
        "title": "普通节点",
        "content": "嗯不同城市的优惠政策不太一样。我们给您算一个当地的底价，您看您是打算在哪个城市买车呢？"
      },
      {
        "title": "普通节点",
        "content": "嗯，不同城市的经销商呢可能都会有不同的优惠。我们也是希望能给到您最好的服务嘛。您看您主要是在哪个城市呢？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "信息授权确认",
    "sort": 10,
    "uuid": "98b50a4f847a4a0d94859a5be86855b9",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "信息授权确认",
        "type": "defaultNode",
        "content": "请您手机尾号${\"手机尾号\"}的电话保持畅通给你报个底价好吗？",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 询问客户姓氏",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "询问客户姓氏"
    ],
    "speechNodes": [
      {
        "title": "信息授权确认",
        "content": "请您手机尾号${\"手机尾号\"}的电话保持畅通给你报个底价好吗？"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "成功结束",
    "sort": 11,
    "uuid": "7e15b88fb6f54b2fa5d698fa956ee869",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "成功结束",
        "type": "defaultYSquare",
        "content": "哎，那今天就先不打扰您了，祝您购车顺利，再见。",
        "next": "挂机",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "挂机"
    ],
    "speechNodes": [
      {
        "title": "成功结束",
        "content": "哎，那今天就先不打扰您了，祝您购车顺利，再见。"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "失败挂机",
    "sort": 12,
    "uuid": "44a893faef7f4d20bb1afa2b25c9ee25",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "失败挂机",
        "type": "defaultYSquare",
        "content": "很抱歉打扰到您，祝您生活愉快，再见。",
        "next": "挂机",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "挂机"
    ],
    "speechNodes": [
      {
        "title": "失败挂机",
        "content": "很抱歉打扰到您，祝您生活愉快，再见。"
      }
    ]
  },
  {
    "botId": 100010,
    "name": "无声挂机",
    "sort": 13,
    "uuid": "eac84c33414244e3b39facea5f836949",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "无声挂机",
        "type": "defaultYSquare",
        "content": "",
        "next": "挂机",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "挂机"
    ],
    "speechNodes": []
  },
  {
    "botId": 100010,
    "name": "二手车",
    "sort": 14,
    "uuid": "f466a6015001455eb5d18a404217b040",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "指定主流程 / 失败挂机",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "失败挂机"
    ],
    "speechNodes": []
  },
  {
    "botId": 100010,
    "name": "性别采集",
    "sort": 15,
    "uuid": "e6af3f81ed9d45f0adfd9f59ed234390",
    "nodes": [
      {
        "component": "nodeNew",
        "title": "普通节点",
        "type": "defaultNode",
        "content": "性别采集",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": "nodeNew",
        "title": "跳转节点",
        "type": "defaultYSquare",
        "content": "",
        "next": "挂机",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      },
      {
        "component": null,
        "title": "",
        "type": "",
        "content": "",
        "next": "",
        "transfer": false,
        "eavesdrop": false
      }
    ],
    "jumpTargets": [
      "挂机"
    ],
    "speechNodes": [
      {
        "title": "普通节点",
        "content": "性别采集"
      }
    ]
  }
];

/** 子流程执行顺序（按 sort） */
export const legacyFlowOrder: string[] = ["开场白","其他购车相关问题","其他非相关问题","挽回1","询问关注品牌","询问关注车系","预计购车时间","询问客户姓氏","询问所在地区","信息授权确认","成功结束","失败挂机","无声挂机","二手车","性别采集"];
