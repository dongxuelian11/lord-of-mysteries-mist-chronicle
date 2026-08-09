import type { CaseFile, EvidenceLink, EvidenceNode, HiddenWorldFact, InventoryItem, Opportunity, PlayerOrigin, WorldFact } from "./game-model.ts";

type OpeningState = {
  facts: WorldFact[];
  evidenceNodes: EvidenceNode[];
  evidenceLinks: EvidenceLink[];
  opportunities: Opportunity[];
  inventory: InventoryItem[];
  hiddenWorldFacts: HiddenWorldFact[];
  caseFile: CaseFile;
};

export function createOpeningState(origin: Pick<PlayerOrigin, "organizationKind" | "identityLabel">): OpeningState {
  const identity = origin.identityLabel;
  const week = 1;
  const facts = (items: [string, string, string][]) => items.map(([subject, statement, source], index) => ({ id: `fact-opening-${origin.organizationKind}-${index}`, subject, statement, certainty: "确认" as const, source, week }));
  const evidence = (items: [string, string, string, "已确认" | "可信证据" | "推断", boolean][]) => items.map(([id, label, summary, certainty, discovered]) => ({ id, caseId: `opening-${origin.organizationKind}`, label, kind: "记录" as const, summary, certainty: certainty as EvidenceNode["certainty"], discovered, source: `${identity}的初期调查`, tags: [label.slice(0, 2), "开局"], weekDiscovered: discovered ? week : undefined }));
  const opportunity = (id: string, title: string, description: string, districtId: string, requirementId: string, suggestedIntent: string) => ({ id, caseId: `opening-${origin.organizationKind}`, title, description, districtId, risk: "中" as const, requirements: [requirementId], suggestedIntent, rewardPreview: "把开局线索转化为可交叉验证的新事实", state: "available" as const });
  const hidden = (id: string, subjectKey: string, statement: string) => ({ id, subjectKey, statement, origin: "fixed" as const, createdWeek: week });
  const inventory = (id: string, name: string, category: "证据" | "封印物" | "仪式器具" | "身份文件", location: string, keeper: string, risk: string) => ({ id, name, category, quantity: 1, location, keeper, risk });

  const kinds: Record<string, OpeningState> = {
    detective: {
      facts: facts([["失踪委托人的名单", "一名常客留下半份名单后消失，名单只写着地址与时间。", "门房记录"], ["失踪委托人", "最后一次出现在事务所门口，随后没有回到住处。", "街口车夫证词"]]),
      evidenceNodes: evidence([
        ["ev-detective-list", "半份名单", "名单只剩半页，地址与时间仍可辨认，最后一栏被雨水浸透。", "已确认", true],
        ["ev-detective-courier", "门口的马车", "委托人当晚乘一辆未登记的马车离开，车夫说他没有报目的地。", "可信证据", true],
        ["ev-detective-route", "离开路线", "马车在桥区绕行两圈后驶向东区方向。", "推断", true],
        ["ev-detective-ink", "名单墨迹", "半页名单的墨迹与事务所旧账本不一致。", "推断", false],
        ["ev-detective-house", "空置地址", "名单上的地址登记为空置房产，但窗口有近期擦拭的痕迹。", "推断", false],
      ]),
      evidenceLinks: [
        { id: "link-detective-1", from: "ev-detective-list", to: "ev-detective-route", label: "名单路线", discovered: true },
        { id: "link-detective-2", from: "ev-detective-courier", to: "ev-detective-route", label: "同一辆马车", discovered: false },
      ],
      opportunities: [
        opportunity("op-detective-list", "核对名单地址", "确认空置房产的登记与近期使用情况。", "east", "ev-detective-list", "以公开房产登记核对名单上的地址，确认空置时间与近期使用痕迹；不进入室内，不接触住户。"),
        opportunity("op-detective-route", "沿马车路线调查", "从桥区到东区逐段核对夜间马车与货运记录。", "bridge", "ev-detective-route", "沿马车绕行路线核对桥区到东区的夜间记录，只做观察与公开记录比对，不接触当事人。"),
        opportunity("op-detective-courier", "追查未登记马车", "查找当晚在事务所附近接客的马车行。", "cherwood", "ev-detective-courier", "从马车行公开排班与路口记录查找当晚未登记的马车，只核对时间与车号。"),
      ],
      inventory: [inventory("opening-list-item", "被雨水浸透的半份名单", "证据", "证据档案室", "伊妮丝·科尔", "名单只剩半页，来源不明。")],
      hiddenWorldFacts: [hidden("hidden-detective-list", "opening-list", "名单上的人与一份更早的失踪记录存在重叠。")],
      caseFile: { id: "opening-detective", title: "失踪委托人的半份名单", premise: "一名常客留下半份名单后消失，名单只写着地址与时间。", stakes: "委托人可能已经遇险，名单也可能流进他人手里。", state: "active", pressure: 64, discoveredCount: 3, totalCount: 5 },
    },
    charity: {
      facts: facts([["没有名字的病人", "诊所收治一名没有名字的病人，他手上有黑斑，病历一栏被人撕掉。", "诊所值班记录"], ["留下的旧布袋", "病人今早独自离开，留下一个旧布袋。", "诊所储物间清点"]]),
      evidenceNodes: evidence([
        ["ev-charity-bag", "旧布袋", "布袋里有半块肥皂、一张没有署名的票据和一段湿绳。", "已确认", true],
        ["ev-charity-record", "撕毁的病历", "病历姓名栏被撕掉，体温记录停在凌晨三点。", "可信证据", true],
        ["ev-charity-witness", "邻居证词", "有邻居看见病人从东区方向走来，身上带着煤灰。", "推断", true],
        ["ev-charity-stain", "黑斑样本", "手上黑斑的形态与普通煤灰不同，呈环形。", "推断", false],
        ["ev-charity-slip", "无名票据", "票据上的抬头被划去，只剩一个日期。", "推断", false],
      ]),
      evidenceLinks: [
        { id: "link-charity-1", from: "ev-charity-bag", to: "ev-charity-slip", label: "同一来源", discovered: false },
        { id: "link-charity-2", from: "ev-charity-witness", to: "ev-charity-record", label: "到达时间", discovered: true },
      ],
      opportunities: [
        opportunity("op-charity-bag", "检查旧布袋", "清点布袋物品并核对票据日期。", "south", "ev-charity-bag", "在诊所内清点布袋物品，只记录可核验信息，不公开病人身份。"),
        opportunity("op-charity-record", "核对值班记录", "确认病人入院时间与当晚值班人员。", "south", "ev-charity-record", "调阅诊所值班记录与入院时间，核对撕毁病历前后的接触者。"),
        opportunity("op-charity-witness", "走访邻居", "沿东区方向询问清晨是否有人见过病人。", "east", "ev-charity-witness", "以诊所名义询问清晨见过病人的居民，只记录时间与方向，不追问私事。"),
      ],
      inventory: [inventory("opening-bag-item", "病人留下的旧布袋", "证据", "诊所储物间", "诺拉·贝尔", "来源不明，未公开。")],
      hiddenWorldFacts: [hidden("hidden-charity-stain", "opening-stain", "环形黑斑与一种正在扩散的污染存在对应关系。")],
      caseFile: { id: "opening-charity", title: "诊所里没有名字的病人", premise: "诊所收治一名没有名字的病人，他手上有黑斑，病历一栏被人撕掉。", stakes: "黑斑可能意味着污染，布袋里的东西可能牵连更多病人。", state: "active", pressure: 62, discoveredCount: 3, totalCount: 5 },
    },
    archive: {
      facts: facts([["被封存的目录", "封存目录被借阅者翻动过：一页关于旧仪式的条目被撕走。", "档案室检查"], ["借阅登记", "借阅登记上没有对应签名。", "档案室记录"]]),
      evidenceNodes: evidence([
        ["ev-archive-page", "被撕走的条目", "条目只留下开头：旧仪式材料索引，卷号被撕去。", "已确认", true],
        ["ev-archive-register", "借阅登记", "登记本最后一页有新的墨迹，但没有签名。", "可信证据", true],
        ["ev-archive-door", "出入记录", "封存室的出入记录与借阅登记时间不一致。", "推断", true],
        ["ev-archive-ink", "墨迹对比", "登记墨迹与常驻借阅者的笔迹不同。", "推断", false],
        ["ev-archive-key", "钥匙保管", "封存室钥匙的保管记录少了一行。", "推断", false],
      ]),
      evidenceLinks: [
        { id: "link-archive-1", from: "ev-archive-page", to: "ev-archive-register", label: "同一时段", discovered: true },
        { id: "link-archive-2", from: "ev-archive-register", to: "ev-archive-door", label: "时间冲突", discovered: false },
      ],
      opportunities: [
        opportunity("op-archive-ink", "核对笔迹", "比对登记墨迹与最近接触目录的人。", "north", "ev-archive-ink", "只比对公开借阅登记的笔迹与近期接触目录的人员样本，不做无依据指控。"),
        opportunity("op-archive-door", "复核出入记录", "核对封存室钥匙与出入记录。", "north", "ev-archive-door", "复核封存室钥匙保管与出入记录，找出时间冲突。"),
        opportunity("op-archive-key", "追查钥匙保管", "确认钥匙保管记录缺失的那一行由谁经手。", "cherwood", "ev-archive-key", "核对钥匙保管记录与值班表，只做内部核查。"),
      ],
      inventory: [inventory("opening-page-item", "封存目录残页", "证据", "证据档案室", "塞德里克·霍尔", "涉及旧仪式材料索引。")],
      hiddenWorldFacts: [hidden("hidden-archive-index", "opening-index", "被撕条目指向一条仍在流通的旧仪式材料索引。")],
      caseFile: { id: "opening-archive", title: "被封存的目录缺了一页", premise: "封存目录被借阅者翻动过：一页关于旧仪式的条目被撕走。", stakes: "被撕走的条目可能让外人顺藤摸瓜找到更多封存资料。", state: "active", pressure: 60, discoveredCount: 3, totalCount: 5 },
    },
    trading: {
      facts: facts([["无货单的密封箱", "货仓里出现一只没有货单的密封箱，封蜡上有陌生徽记。", "货仓清点"], ["码头管事的说法", "码头管事说不清箱子何时入库。", "码头记录"]]),
      evidenceNodes: evidence([
        ["ev-trading-crate", "密封箱", "箱体没有货单，封蜡上的徽记与任何登记客户都不符。", "已确认", true],
        ["ev-trading-log", "卸货记录", "当周卸货记录里没有对应批次。", "可信证据", true],
        ["ev-trading-worker", "搬运者", "有码头工人记得两名陌生搬运者深夜入库。", "推断", true],
        ["ev-trading-seal", "封蜡样本", "封蜡成分与港务常用蜡不同。", "推断", false],
        ["ev-trading-ship", "入港船名", "当晚有一般未登记的驳船停靠外港。", "推断", false],
      ]),
      evidenceLinks: [
        { id: "link-trading-1", from: "ev-trading-crate", to: "ev-trading-log", label: "无对应批次", discovered: true },
        { id: "link-trading-2", from: "ev-trading-worker", to: "ev-trading-ship", label: "深夜入港", discovered: false },
      ],
      opportunities: [
        opportunity("op-trading-log", "核对卸货记录", "确认箱子入库时间与当周批次。", "dock", "ev-trading-log", "核对当周卸货与入库记录，确认密封箱入库时间，不接触搬运者。"),
        opportunity("op-trading-worker", "询问码头工人", "了解深夜搬运者的情况。", "dock", "ev-trading-worker", "以商行名义询问当班码头工人，只记录时间、人数与离开方向。"),
        opportunity("op-trading-seal", "鉴定封蜡", "确认封蜡成分与来源。", "hillston", "ev-trading-seal", "委托可靠渠道鉴定封蜡成分，不拆箱、不公开。"),
      ],
      inventory: [inventory("opening-crate-item", "无货单的密封箱", "封印物", "货仓暗格", "塞德里克·霍尔", "封蜡上有陌生徽记，未拆封。")],
      hiddenWorldFacts: [hidden("hidden-trading-crate", "opening-crate", "箱体残留与一条深夜走私链存在关联。")],
      caseFile: { id: "opening-trading", title: "货仓里多出的密封箱", premise: "货仓里出现一只没有货单的密封箱，封蜡上有陌生徽记。", stakes: "箱内物品一旦被发现，商行的合法掩护会立刻失效。", state: "active", pressure: 63, discoveredCount: 3, totalCount: 5 },
    },
    sect: {
      facts: facts([["旧成员的密信", "一位旧成员在聚会散场后留下密信，说“有人在按名单找我们”。", "聚会清点"], ["旧成员失踪", "留下密信后，旧成员没有再出现。", "内部联络"]]),
      evidenceNodes: evidence([
        ["ev-sect-letter", "密信", "信纸是常见纸，墨迹没有署名，末尾画了一个旧徽记。", "已确认", true],
        ["ev-sect-signin", "聚会签到", "签到本上旧成员的名字被划掉，但没有登记离开。", "可信证据", true],
        ["ev-sect-visitor", "陌生访客", "有成员看见一名陌生人在聚会散场后守在巷口。", "推断", true],
        ["ev-sect-ink", "墨迹来源", "信纸墨迹与附近文具店售出的墨水相近。", "推断", false],
        ["ev-sect-route", "离开路线", "旧成员离开时没有走惯常路线。", "推断", false],
      ]),
      evidenceLinks: [
        { id: "link-sect-1", from: "ev-sect-letter", to: "ev-sect-signin", label: "同一晚", discovered: true },
        { id: "link-sect-2", from: "ev-sect-visitor", to: "ev-sect-route", label: "巷口监视", discovered: false },
      ],
      opportunities: [
        opportunity("op-sect-letter", "核验密信来源", "检查信纸与墨迹来源。", "cherwood", "ev-sect-letter", "在不惊动外人的前提下核验信纸与墨迹来源。"),
        opportunity("op-sect-visitor", "追查陌生访客", "确认散场后守在巷口的陌生人。", "south", "ev-sect-visitor", "以读书会名义询问附近住户，只记录时间与体貌。"),
        opportunity("op-sect-route", "复查离开路线", "确认旧成员离开时的路线。", "bridge", "ev-sect-route", "沿旧成员惯常路线复查当晚的夜间记录。"),
      ],
      inventory: [inventory("opening-letter-item", "旧成员留下的密信", "证据", "密议室暗柜", "罗文·布莱克", "信中说有人在按名单寻找组织。")],
      hiddenWorldFacts: [hidden("hidden-sect-list", "opening-sect-list", "有人在按一份旧名单逐一确认结社成员的身份。")],
      caseFile: { id: "opening-sect", title: "旧成员留下的密信", premise: "一位旧成员留下密信后失踪，信里说有人在按名单寻找组织。", stakes: "若名单真的存在，结社的隐蔽身份可能已经暴露。", state: "active", pressure: 61, discoveredCount: 3, totalCount: 5 },
    },
  };
  return kinds[origin.organizationKind] ?? kinds.detective;
}


