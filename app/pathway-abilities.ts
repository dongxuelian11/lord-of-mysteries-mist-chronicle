import type { Ability, AbilityContextKind, PathwayId } from "./game-model.ts";

const ALL: AbilityContextKind[] = ["council", "dialogue", "district", "organization", "self", "dream", "spirit"];
const WORLD: AbilityContextKind[] = ["district", "organization", "self", "spirit"];
const SOCIAL: AbilityContextKind[] = ["council", "dialogue", "organization", "self", "dream"];

function a(
  id: string, unlockRank: number, name: string, verb: string, description: string, cost: number,
  mode: Ability["mode"], scope: string, duration: string, risk: string, contexts: AbilityContextKind[],
  ruleTags: string[], constraints: string[] = [], passive = false, sceneLayer?: Ability["sceneLayer"],
): Ability {
  return { id, unlockRank, name, verb, description, cost, mode, scope, duration, risk, contexts, ruleTags, constraints: constraints.length ? constraints : ["只能产生能力定义范围内的效果，不能越权生成未知事实"], passive, sceneLayer };
}

export const PATHWAY_ABILITIES: Record<PathwayId, Ability[]> = {
  seer: [
    a("spirit-vision", 9, "灵视", "观察灵性痕迹", "直接观察灵体、情绪色彩、污染残留与仪式痕迹；只能描述可见现象。", 1, "感知", "视野内单一目标或小型现场", "集中期间", "未知存在可能沿注视反向感知使用者。", ALL, ["reveal", "occult"], ["不能读取思想或幕后身份"]),
    a("divination", 9, "媒介占卜", "取得象征性启示", "围绕一个明确问题和媒介取得象征、方向与危险倾向。", 2, "感知", "一个问题", "一次解读", "反占卜会制造矛盾象征，接近高位存在时可能遭到注视。", ALL, ["reveal", "occult"], ["问题必须明确", "结果不是公开证据"]),
    a("danger-sense", 9, "危险直觉", "感知迫近危险", "在危险真正逼近时提供身体层面的预警，但不解释来源。", 0, "防护", "自身与近身环境", "持续被动", "污染与精心误导可能制造假警报。", ALL, ["defense", "reveal"], ["只提示迫近性"], true),
    a("clown-control", 8, "精密身体控制", "控制平衡、肌肉与表情", "在失衡、受伤、伪装情绪或精细动作中保持异常稳定。", 1, "防护", "自身", "数分钟", "无法抵消真实伤势，过度控制会掩盖恶化征兆。", ["dialogue", "district", "self"], ["defense", "covert"]),
    a("card-weapon", 8, "纸牌武器", "投射轻薄物体", "将纸牌或相似轻薄物体作为高速精确投射物，用于切断、缴械或攻击。", 1, "战斗", "十余米内单体或小型物件", "瞬间", "在人群中使用会误伤并留下明显非凡痕迹。", ["district", "organization", "self"], ["force"], ["必须有轻薄媒介"]),
    a("facial-discipline", 8, "表情纪律", "隐藏疼痛与即时情绪", "控制面部、呼吸和细微动作，使普通观察难以判断真实状态。", 0, "伪装", "自身", "持续维持", "读心、灵视和高阶心理能力仍可能识破。", SOCIAL, ["covert", "social"], [], true),
    a("flame-jump", 7, "火焰跳跃", "在火焰之间转移", "借助视野内或已准备的火焰完成短距离位置转移。", 2, "移动", "同一现场内两处火焰", "瞬间", "目标火焰熄灭、被封锁或位于危险空间时会造成偏移。", ["district", "organization", "self"], ["access", "covert"], ["需要起点与终点火焰"]),
    a("damage-transfer", 7, "伤害转移", "把一次伤害转移到替代物", "将刚刚承受的有限伤害转移至准备好的纸人或相似替代物。", 3, "防护", "自身一次伤害", "伤害发生后的短暂窗口", "无法承受远超当前层次的伤害，连续使用会急剧增加负荷。", ["district", "organization", "self"], ["defense", "covert"], ["需要替代物"]),
    a("paper-substitute", 7, "纸人替身", "制造误导性替身", "让准备好的纸人短暂代替自身位置、气息或一次锁定。", 2, "伪装", "同一现场", "数秒至一分钟", "高阶感知可沿替身追溯本体。", ["district", "organization", "self"], ["covert", "defense"], ["需要纸人媒介"]),
    a("faceless-shape", 6, "无面变形", "改变容貌、体型和声线", "在生理边界内重塑外貌、体型、肤色与声线，并持续维持身份。", 3, "伪装", "自身", "数小时，可持续消耗", "不能复制记忆、非凡气息或完整社会关系；遗忘本貌会增加人格偏移。", SOCIAL, ["covert", "social"], ["需要观察目标细节"]),
    a("habit-imitation", 6, "习惯模仿", "复制外在习惯", "通过观察复制步态、惯用手、停顿和社交节奏，提升身份欺骗的完整度。", 1, "伪装", "一个已观察目标", "数小时", "不理解关系背景时会在关键问题上露出破绽。", SOCIAL, ["covert", "social"], ["不能复制知识"]),
    a("identity-anchor", 6, "自我锚定", "确认真实身份边界", "在长期伪装、梦境或精神干扰中重新确认自身关系与记忆锚点。", 1, "防护", "自身", "一次稳定", "锚点本身遭到篡改时只能暴露矛盾，不能自动恢复真相。", ["self", "dream", "spirit"], ["defense", "covert"], [], true),
    a("spirit-thread-sight", 5, "灵体之线视野", "观察灵体之线", "看见一定范围内生灵与灵体的控制之线、活跃度和异常牵引。", 3, "感知", "小型建筑或近距离人群", "集中期间", "凝视强者的灵体之线会暴露自身；看见不等于能够控制。", ALL, ["reveal", "occult"], ["不能跨越层次强行控制"]),
    a("marionette-touch", 5, "初步秘偶化", "侵蚀目标灵体之线", "在持续接触与目标失去反抗能力时逐步取得有限控制。", 5, "影响", "单一受控目标", "需要持续推进", "这是高暴露、强敌意行为；目标未满足条件时必然失败并反制。", ["district", "organization", "spirit"], ["social", "force", "occult"], ["目标必须失去有效反抗", "不能瞬间完成"]),
    a("shared-marionette-sense", 5, "共享秘偶感官", "借受控对象观察", "通过已经合法建立的秘偶连接共享有限感官与位置。", 2, "感知", "一个现有秘偶", "持续消耗", "秘偶受到污染、遮蔽或摧毁时会反冲本体。", ALL, ["reveal", "covert"], ["必须已有秘偶"]),
  ],
  spectator: [
    a("observe", 9, "行为观察", "建立心理画像", "从言行、微表情、选择和环境关系中识别情绪与行为矛盾。", 0, "感知", "视听范围内目标", "持续被动", "只能形成推断，把画像当事实会造成误判。", SOCIAL, ["reveal", "social"], ["不能读取思想"], true),
    a("empathy-probe", 9, "情绪探针", "确认主导情绪", "集中感知一个目标当前最强烈的情绪及大致压力方向。", 1, "感知", "单一目标", "数十秒", "强烈情绪可能反向感染使用者。", SOCIAL, ["reveal", "social"]),
    a("guided-talk", 9, "引导式谈话", "降低语言防御", "依据既有心理画像调整问题顺序，使对方更愿意自然开口。", 1, "影响", "一次对话", "谈话期间", "不能强迫吐露秘密；被察觉会损害信任。", ["council", "dialogue", "organization"], ["social"]),
    a("surface-thought", 8, "表层思绪读取", "捕捉当下思绪倾向", "在近距离捕捉目标此刻最表层、最活跃的念头方向，而非完整句子。", 2, "感知", "单一近距离目标", "数秒", "精神防护、杂念和刻意诱导会污染结果。", SOCIAL, ["reveal", "social"], ["不能读取深层记忆"]),
    a("emotion-source", 8, "情绪溯源", "定位情绪触发点", "将主导情绪与刚发生的刺激、名字或记忆入口建立概率联系。", 1, "感知", "单一目标", "一次判断", "只能确认触发关系，不能证明背后事实。", SOCIAL, ["reveal", "social"]),
    a("verbal-suggestion", 8, "语言暗示", "轻推一个即时选择", "利用语气与心理节奏提高目标接受一个合理、低冲突建议的可能。", 2, "影响", "一次谈话中的单一建议", "短暂", "违背目标核心利益或人格的建议无效并容易暴露。", ["council", "dialogue", "organization"], ["social"], ["必须符合目标当下逻辑"]),
    a("psychological-treatment", 7, "心理治疗", "稳定创伤与失控情绪", "通过结构化交流和非凡影响缓解创伤反应、恐慌与轻度精神污染。", 3, "影响", "单一自愿目标", "数十分钟至多次治疗", "不能抹去人格或替代长期恢复；强行治疗会加重创伤。", SOCIAL, ["social", "defense"], ["目标原则上需要同意"]),
    a("psychological-cue", 7, "心理暗示", "植入短期心理指向", "把一个符合目标部分动机的念头强化为短期行动倾向。", 3, "影响", "单一目标", "数小时", "反复使用会形成察觉、依赖或人格伤害。", SOCIAL, ["social", "covert"], ["不能强迫自毁或违背核心人格"]),
    a("emotion-stabilize", 7, "情绪稳定", "压低群体恐慌峰值", "在小范围内降低恐慌、愤怒或绝望的即时强度，为沟通和撤离创造窗口。", 2, "防护", "一间房或小队", "数分钟", "只压低峰值，不解决情绪原因。", ["council", "district", "organization", "dream"], ["social", "defense"]),
    a("deep-hypnosis", 6, "深层催眠", "进入封闭心理层", "在目标放松或防御被削弱时建立深层催眠状态，访问被封闭的记忆入口。", 4, "影响", "单一目标", "数分钟", "错误引导会制造假记忆；强精神目标可反向侵入。", ["dialogue", "organization", "dream"], ["social", "covert"], ["需要目标防御降低"]),
    a("behavior-command", 6, "行为暗示", "植入带触发条件的行为", "设置一个符合目标现有逻辑的短期行为和明确触发条件。", 4, "影响", "单一目标", "数日至触发", "越违背人格越容易失败并被识破；不可绕过死亡与核心规则。", SOCIAL, ["social", "covert"], ["必须有触发条件"]),
    a("memory-door", 6, "记忆门扉", "寻找被封闭的记忆线索", "在催眠或梦境状态中定位记忆封锁、篡改和创伤留下的边界。", 3, "感知", "单一心理空间", "场景持续", "只能确认结构与碎片，不能凭空恢复真实记忆。", ["dialogue", "self", "dream"], ["reveal", "social"], ["需要催眠或梦境入口"], false, "dream"),
    a("dream-entry", 5, "梦境行走", "主动进入指定梦境", "以现实锚点进入一个正在形成的梦境，在其中观察、交流或寻找创伤节点。", 3, "移动", "单一梦境", "持续消耗", "梦主防御、共享潜意识与错误记忆会侵蚀场景稳定。", ["dialogue", "self", "dream"], ["access", "social", "reveal"], ["需要梦主、媒介或稳定坐标"], false, "dream"),
    a("dream-shaping", 5, "梦境塑形", "改变梦境局部场景", "在已进入的梦境中重塑局部象征、道路和安全空间，但不能改写真实经历。", 4, "影响", "当前梦境局部", "场景持续", "过度塑形会惊醒梦主或让虚构覆盖可用信息。", ["dream"], ["social", "reality"], ["必须已在梦境中"]),
    a("trauma-trace", 5, "创伤追踪", "沿梦境重复寻找心理伤口", "利用梦境中反复出现的象征定位创伤来源、回避点与外部精神影响。", 2, "感知", "当前梦境", "持续观察", "得到的是心理结构，不自动证明现实事件。", ["dream"], ["reveal", "social"], ["必须已在梦境中"]),
  ],
  apprentice: [
    a("door-sense", 9, "门径感知", "寻找隐蔽入口", "感知建筑空腔、薄弱边界、隐藏门和可撤离路线。", 1, "感知", "一座小型建筑", "集中期间", "异常空间可能伪装成出口。", WORLD, ["access", "reveal"]),
    a("open-lock", 9, "开锁术", "干涉普通封锁", "短暂干涉普通门锁、窗栓和简单机械结构。", 1, "移动", "接触范围单一封锁", "瞬间", "会留下可被追踪的空间扰动，无法打开高阶神秘封印。", WORLD, ["access", "covert"]),
    a("spatial-instinct", 9, "空间直觉", "记忆路线与方位", "持续建立行进路线和相对方位，在混乱环境中保留退路。", 0, "防护", "自身与同行小队", "持续被动", "灵界和扭曲空间中只提供倾向。", ALL, ["access", "defense"], [], true),
    a("trick-light", 8, "光影戏法", "制造光、影与短暂遮蔽", "制造小范围光源、闪光、暗影或视觉错位。", 1, "影响", "一间房或十余米", "数秒至数分钟", "不具备真实幻术的完整欺骗力。", ["district", "organization", "self"], ["covert", "force"]),
    a("trick-control", 8, "微型控场", "制造滑倒、震慑与牵引", "组合风、冰、滑腻和微弱冲击，在小范围打断动作或创造撤离窗口。", 2, "战斗", "小范围", "数秒", "无法正面对抗强大目标，拥挤环境可能误伤。", ["district", "organization", "self"], ["force", "access"]),
    a("trick-combination", 8, "戏法组合", "串联数种微型法术", "把两个以上小型戏法按玩家意图组成一段连锁效果。", 2, "制作", "同一现场", "一分钟内", "组合越复杂越容易出现次序偏差。", WORLD, ["force", "covert", "access"], ["必须说明组合顺序"]),
    a("stellar-reading", 7, "星象观测", "读取宏观趋势", "依据真实星象、时间与地点判断事件趋势、空间异常和危险窗口。", 2, "感知", "一个明确地点或计划", "一次观测", "天气、遮蔽与反预言会降低精度。", ALL, ["reveal", "occult"]),
    a("coordinate-fix", 7, "坐标固定", "建立可靠空间坐标", "为一个到访地点建立可复用坐标和现实锚点。", 2, "仪式", "单一地点", "持续至锚点破坏", "地点变化或高阶封锁会使坐标失真。", ["district", "organization", "spirit"], ["access", "occult"], ["必须亲自确认地点"]),
    a("prediction-resistance", 7, "预言抗性", "扰乱对自身的低阶预言", "让自身近期行动在低阶占卜中呈现噪声与多种可能。", 1, "防护", "自身", "数小时", "无法遮蔽高位存在，反复使用会暴露有人刻意干扰。", ALL, ["defense", "covert"], [], true),
    a("ability-record", 6, "能力记录", "记录见证过的非凡能力", "解析并记录亲眼见证、结构可理解且不超出承载上限的非凡能力。", 4, "制作", "单一能力印记", "保存至使用或失效", "记录不是完整复制；高位或权柄类能力会失败并反噬。", ALL, ["occult", "reality"], ["必须真实见证", "需要可用记录槽"]),
    a("ability-replay", 6, "记录复现", "释放已记录能力", "按记录时的有限规模复现一个已保存能力。", 4, "影响", "服从被记录能力", "一次", "复现仍承担原能力风险，且效果低于原主。", ALL, ["force", "social", "occult", "access"], ["必须已有有效记录"]),
    a("spell-analysis", 6, "法术结构分析", "拆解能力构造", "观察能力的媒介、目标、路径和边界，为反制、记录或仪式研究提供结构。", 2, "感知", "正在发生或残留的能力", "集中期间", "只能分析可观察结构，未知权柄会产生错误模型。", ALL, ["reveal", "occult"]),
    a("spirit-travel", 5, "灵界穿梭", "主动进入灵界", "以已确认现实锚点直接进入灵界，并按玩家指定方向旅行或撤离。", 4, "移动", "灵界航路", "持续消耗", "错误锚点、危险存在与方向失真可能切断归途。", ["district", "organization", "self", "spirit"], ["access", "occult"], ["需要现实锚点"], false, "spirit"),
    a("short-teleport", 5, "短距传送", "跨越已知空间", "在已知、未封锁且能够定位的两个位置间完成短距离传送。", 4, "移动", "同城或当前区域", "瞬间", "坐标错误会造成偏移、受伤或暴露。", WORLD, ["access"], ["终点必须已知"]),
    a("escape-route", 5, "远程逃生路线", "预设紧急传送锚点", "为一次行动建立可在危急时触发的远程撤离路线。", 3, "防护", "一支小队", "维持至触发或一周", "封锁、超载和成员分散会降低成功率。", ALL, ["access", "defense"], ["需要预设坐标"]),
  ],
  hunter: [
    a("track", 9, "痕迹追踪", "拼出目标路线", "从脚印、气味、纤维、磨损和行为规律恢复目标近期路线。", 0, "感知", "一个现场或路线", "持续被动", "强大猎物可能故意留下误导。", WORLD, ["track", "reveal"], [], true),
    a("trap", 9, "快速陷阱", "制造预警、阻滞或捕获装置", "利用现场材料快速布置一个明确用途的机械陷阱。", 1, "制作", "单一入口或小范围", "持续至触发", "仓促陷阱可能伤及无关者并暴露行动。", WORLD, ["track", "force"], ["必须说明用途与安全边界"]),
    a("weakness", 9, "弱点判断", "标记战术薄弱点", "观察目标动作、习惯和环境依赖后标记一个可验证弱点。", 1, "感知", "单一目标", "观察期间", "判断需要时间，伪装可制造假弱点。", WORLD, ["track", "force", "reveal"]),
    a("provoke", 8, "精准挑衅", "诱发可预测的愤怒反应", "针对已识别心理弱点选择言辞或动作，使目标更可能按愤怒行动。", 2, "影响", "单一可交流目标", "数分钟", "失控的目标可能攻击无辜者；不了解弱点时容易反噬。", ["council", "dialogue", "district", "organization"], ["social", "force"], ["需要已知弱点"]),
    a("conflict-read", 8, "冲突嗅觉", "识别群体矛盾的燃点", "识别群体中谁在压抑怒火、谁能被说服以及哪项利益会引爆冲突。", 1, "感知", "一场会议或小型人群", "观察期间", "只能识别燃点，不等同于知道幕后利益。", ["council", "dialogue", "district", "organization"], ["reveal", "social"], [], true),
    a("baited-choice", 8, "诱导失误", "把目标引向预设错误", "通过挑衅、假破绽和环境安排提高目标选择一条错误路线的概率。", 2, "影响", "单一目标", "一个交锋", "目标保持冷静或识破诱饵时会反向利用布局。", ["district", "organization"], ["track", "social", "covert"], ["需要预设诱饵"]),
    a("fire-shaping", 7, "火焰操纵", "塑造与移动火焰", "点燃、移动、压缩或熄灭普通规模火焰，并控制主要蔓延方向。", 3, "战斗", "一间房至小型街面", "持续消耗", "燃料、风向和无辜者会改变风险；不能忽视真实火灾后果。", WORLD, ["force", "occult"], ["必须标明防火边界"]),
    a("flame-weapon", 7, "火焰武器", "让武器附着高温火焰", "为手持武器或投射物附加受控火焰，提高破坏与威慑。", 2, "战斗", "单一武器", "数分钟", "留下明显非凡痕迹并可能点燃环境。", ["district", "organization", "self"], ["force"]),
    a("heat-endurance", 7, "高温耐受", "抵抗火焰和高温环境", "显著提高自身对火焰、热浪和烟气的耐受，但不提供完全免疫。", 1, "防护", "自身", "持续期间", "缺氧、爆炸和非火焰伤害仍然有效。", WORLD, ["defense", "force"], [], true),
    a("conspiracy-model", 6, "阴谋建模", "建立多方行动模型", "把人物目标、资源、时限与误判组织成可更新的多方计划，而非直接预知结果。", 2, "感知", "一个多方局势", "持续规划", "遗漏主体和错误假设会让计划在后续周反噬。", ["council", "district", "organization", "self"], ["track", "social", "reveal"]),
    a("organizational-fracture", 6, "组织破绽", "识别制度与协作漏洞", "识别组织流程中依赖单人、信息延迟、利益冲突和可能被利用的断点。", 2, "感知", "一个组织或部门", "一次分析", "可见破绽不代表幕后主体，也可能是诱饵。", ["council", "organization", "district"], ["track", "reveal"]),
    a("layered-misdirection", 6, "多层误导", "布置彼此支撑的假象", "结合人员、时间和假线索，让多个观察者分别得到互相支撑但不完整的解释。", 4, "伪装", "一次组织级行动", "跨越数日", "参与者越多越可能泄露；误导不能反向改变已确认事实。", ["council", "district", "organization"], ["covert", "social", "track"], ["需要至少两层独立手段"]),
    a("battle-rhythm", 5, "战场节奏", "把握决定性窗口", "在多人冲突中判断哪一处行动会改变整体节奏、撤退窗口和伤亡曲线。", 3, "感知", "一处战场或大规模冲突", "持续观察", "只提供战术窗口，不保证行动成功。", ["district", "organization", "self"], ["force", "track", "reveal"]),
    a("reaping-strike", 5, "收割一击", "终结已被削弱的目标", "对已经重伤、失衡或防御崩溃的目标发动高强度决定性攻击。", 5, "战斗", "单一目标", "瞬间", "不能对状态完好的同层强者生效；错误判断会让使用者暴露在反击中。", ["district", "organization", "self"], ["force"], ["目标必须已被明确削弱"]),
    a("combat-command", 5, "小队战术统合", "同步小队攻击与撤离", "通过清晰信号把一支小队的攻击、掩护和撤离压缩进同一战术节奏。", 3, "影响", "一支熟悉的小队", "一场冲突", "成员疲劳、恐惧和不信任会打断统合。", ["council", "district", "organization"], ["force", "social", "defense"], ["成员必须理解信号"]),
  ],
  mystery: [
    a("identify", 9, "神秘鉴定", "鉴定材料、符号与污染", "辨识常见神秘材料、仪式符号、灵性残留和污染类型。", 1, "感知", "接触或近距离单一对象", "数分钟", "主动读取未知知识可能建立危险联系。", ALL, ["occult", "reveal"]),
    a("ritual-design", 9, "基础仪式设计", "选择象征、材料与隔离措施", "围绕明确目的设计低阶仪式结构，并列出对应关系和停止条件。", 1, "仪式", "小型仪式", "准备阶段", "错误对应会招来与目标无关的回应。", ["council", "organization", "self", "spirit"], ["occult"], ["必须说明目标和隔离"]),
    a("occult-memory", 9, "神秘记忆", "检索真正学过的知识", "快速回忆已学习内容并识别符号、材料与历史记录之间的对应。", 0, "感知", "自身知识", "持续被动", "不能凭空知道未学习的知识。", ALL, ["occult", "reveal"], ["受知识权限限制"], true),
    a("combat-analysis", 8, "格斗结构分析", "识别动作链与身体弱点", "把知识转化为对姿势、发力、武器和生理结构的即时分析。", 1, "感知", "单一战斗目标", "观察期间", "陌生物种和非物理能力会降低判断。", ["district", "organization", "self"], ["force", "reveal"]),
    a("scholar-combat", 8, "学者格斗", "执行精确反制动作", "依据已完成分析使用关节、杠杆、节奏和环境完成非蛮力反制。", 2, "战斗", "近身单体", "一次交锋", "未完成分析或体能差距过大时效果有限。", ["district", "organization", "self"], ["force", "defense"], ["需要可用分析"]),
    a("somatic-control", 8, "身体知识调动", "短时优化身体控制", "通过精确呼吸和神经肌肉控制提高动作稳定、疼痛管理和短时爆发。", 1, "防护", "自身", "数分钟", "不能治愈伤势，结束后会积累疲劳。", ["district", "organization", "self"], ["defense"], [], true),
    a("repeatable-witchcraft", 7, "可重复巫术", "施展已验证术式", "依据已掌握的术式、材料和对应关系施展一个可中止的巫术效果。", 3, "仪式", "服从具体术式", "数分钟至数小时", "未验证术式会提高污染和错误回应风险。", ALL, ["occult", "force", "social"], ["必须选择已知术式"]),
    a("curse-thread", 7, "诅咒丝线", "建立受限负面联系", "借目标真实媒介建立可追踪、可解除的轻度诅咒或标记。", 3, "影响", "单一目标", "数日", "媒介错误会反噬，强目标可沿联系反向追踪。", ["district", "organization", "spirit"], ["occult", "covert"], ["需要真实媒介"]),
    a("counter-curse", 7, "反诅咒", "分析并切断低阶诅咒", "识别诅咒媒介、指向和维持点，逐步削弱或切断联系。", 3, "防护", "单一诅咒结构", "一次处理", "粗暴切断可能把反噬转移到受害者或现场。", ALL, ["occult", "defense", "reveal"]),
    a("scroll-inscription", 6, "卷轴制作", "把已知术式封入卷轴", "将一个经过验证、层次允许的能力或巫术封入带触发条件的卷轴。", 4, "制作", "单张卷轴", "准备数小时", "材料、符号或触发语错误会让卷轴失效或反噬。", ["organization", "self"], ["occult", "craft"], ["需要工作台与材料"]),
    a("scroll-release", 6, "卷轴释放", "触发已制作卷轴", "按预设触发条件释放卷轴中的固定效果，使非凡成员以外的人也能执行。", 1, "影响", "服从卷轴", "一次", "使用者仍承担卷轴标明的风险。", ALL, ["occult", "force", "defense"], ["必须拥有有效卷轴"]),
    a("ritual-deconstruction", 6, "仪式解构", "拆解并复制仪式结构", "从完整仪式或残留中识别节点、能量流和停止条件，为复制或破坏提供方案。", 2, "感知", "一套仪式结构", "分析期间", "被故意隐藏的节点可能在拆解时触发。", ALL, ["occult", "reveal"]),
    a("stellar-casting", 5, "星象施法", "借星象放大已知术式", "在正确时间与方位借星象放大范围、精度或持续时间。", 5, "仪式", "城区内一个明确目标", "受星象窗口限制", "错误星象或强行施法会引入不相关象征与污染。", ["district", "organization", "self"], ["occult", "reality"], ["需要已验证星象窗口"]),
    a("macro-forecast", 5, "宏观预判", "预判地区级变化窗口", "结合星象、历史与当前状态预测地区级异常、社会压力或仪式窗口的变化趋势。", 3, "感知", "一个城区或持续计划", "一次预判", "结果是趋势而非确定未来，强干扰会改变分支。", ["council", "district", "organization", "self"], ["reveal", "occult"]),
    a("starlight-ritual", 5, "星光仪式场", "建立稳定星象仪式环境", "为研究、净化、预言或施法建立可跨数小时维持的星光仪式场。", 4, "仪式", "一处设施或小型区域", "数小时", "需要开放天空、对应材料或可靠替代结构。", ["organization", "district", "self"], ["occult", "defense"], ["需要星象对应与隔离措施"]),
  ],
};

export function abilitiesFor(pathwayId: PathwayId, currentSequence: number) {
  return PATHWAY_ABILITIES[pathwayId].filter((ability) => (ability.unlockRank ?? 9) >= currentSequence);
}

export function abilityRuleSummary(ability: Ability) {
  return {
    mode: ability.mode ?? "感知",
    scope: ability.scope ?? "当前目标",
    duration: ability.duration ?? "即时",
    contexts: ability.contexts ?? ALL,
    constraints: ability.constraints ?? [],
    tags: ability.ruleTags ?? [],
  };
}
