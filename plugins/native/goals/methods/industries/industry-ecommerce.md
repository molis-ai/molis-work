---
method_id: industry-ecommerce
version: 1
kind: industry
name: "电商"
summary: "把商品发现、库存价格、交易履约、售后和经营反馈连成完整商业闭环。"
applies_to: ["在线零售","品牌商城","交易型电商"]
domain_tags: ["ecommerce","retail","fulfillment"]
source_refs: ["OECD Recommendation on Consumer Protection in E-commerce","Molis Work commerce result chain"]
confidence: 0.92
---

# 电商

## 规划路径

1. 明确目标顾客、购买任务、商品供给和经营承诺
2. 建立商品、价格、库存、促销和内容权威来源
3. 走通发现、比较、购物车、结账和支付主路径
4. 连接拣配、发货、交付、退换、退款和客服
5. 用转化、毛利、履约质量、退货和复购验证经营结果

## 必须覆盖

| area | label | question |
| --- | --- | --- |
| shopper_mission | 购物任务 | 顾客为何购买，如何发现、比较并形成信任？ |
| catalog_offer | 商品与报价 | 商品、变体、价格、库存和促销的权威来源是什么？ |
| checkout_payment | 结账与支付 | 地址、税费、优惠、支付和确认如何保持一致？ |
| fulfillment_delivery | 履约与交付 | 库存承诺、拣配、物流和交付异常怎样处理？ |
| returns_service | 售后与退款 | 退换、取消、退款和客服如何闭环？ |
| merchandising_economics | 经营与经济性 | 流量、转化、毛利、库存和复购如何共同决策？ |

## 依赖规则

| rule_id | statement | direction_hint |
| --- | --- | --- |
| checkout-after-offer-contract | 结账消费稳定的商品、价格、库存、优惠与交付承诺。 | checkout depends_on catalog and offer contract |
| promise-after-fulfillment | 对外库存和交付承诺消费履约能力、容量和异常恢复证据。 | customer promise depends_on fulfillment readiness |

## 完成证据

- 商品到订单、支付、履约和售后的状态对账
- 价格、库存、优惠和退款边界测试
- 真实购物任务与异常交付验证

## 收口检查

- 顾客看到的价格、库存和交付承诺与后台一致
- 支付成功不等同于履约完成
- 退换退款和客服不是上线后的补充流程

## 常见误拆

- 只做商城页面不做履约闭环
- 多处维护价格或库存真相
- 只优化转化不看毛利、退货和复购
