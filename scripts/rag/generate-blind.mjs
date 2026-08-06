// 独立盲测集生成：150 条自然玩家式查询（不直接机械复刻切片标题）。
import fs from "node:fs";
import path from "node:path";
import { root } from "./lib/paths.mjs";

function q(id, query, category, overrides = {}) {
  return {
    id,
    query,
    category,
    requestScope: overrides.scope ?? "player-known",
    expectedAnswerType: overrides.answerType ?? "entity",
    requiredEntities: overrides.entities ?? [],
    requiredEvidence: overrides.evidence ?? [],
    forbiddenEvidence: overrides.forbidden ?? [],
    spoilerBoundary: overrides.spoiler ?? "volume1",
    week: overrides.week,
    actorKnowledge: overrides.known ?? [],
    topicGrants: overrides.grants ?? [],
    acceptableUncertainty: overrides.uncertainty ?? false,
    expectUnknown: overrides.unknown ?? false,
    minRank: overrides.minRank ?? 10,
  };
}

export function generateBlindSet() {
  const cases = [];
  // 1) 人物与多身份（30）
  cases.push(
    q("b1", "那个假装成疯狂冒险家的克莱恩身份叫什么？", "identity", { entities: ["克莱恩·莫雷蒂", "格尔曼·斯帕罗"], forbidden: ["宇宙级秘密"], spoiler: "volume1" }),
    q("b2", "周明瑞穿越到异世界之后改叫什么名字？", "identity", { entities: ["克莱恩·莫雷蒂", "周明瑞"] }),
    q("b3", "值夜者知道格尔曼和愚者的关系吗？", "identity", { entities: ["值夜者", "格尔曼·斯帕罗", "愚者"], uncertainty: true }),
    q("b4", "塔罗会里代号正义的贵族小姐是谁？", "identity", { entities: ["奥黛丽·霍尔", "塔罗会"] }),
    q("b5", "倒吊人这个代号属于哪个角色？", "identity", { entities: ["阿尔杰·威尔逊"] }),
    q("b6", "克莱恩在廷根的同学后来加入了什么组织？", "identity", { entities: ["伦纳德·米切尔", "值夜者"] }),
    q("b7", "罗塞尔大帝留下的加密日记有什么用途？", "identity", { entities: ["罗塞尔·古斯塔夫", "罗塞尔日记"] }),
    q("b8", "总是戴着单片眼镜、自称阿蒙家族的存在是谁？", "identity", { entities: ["阿蒙"] }),
    q("b9", "寄宿在伦纳德体内的老爷爷真实身份是什么？", "identity", { entities: ["帕列斯·索罗亚斯德", "伦纳德·米切尔"], spoiler: "volume1", uncertainty: true }),
    q("b10", "血族后裔埃姆林在塔罗会的代号是什么？", "identity", { entities: ["埃姆林·怀特", "塔罗会"] }),
    q("b11", "魔术师小姐的真实名字是什么？", "identity", { entities: ["休·迪尔查"] }),
    q("b12", "道恩·唐泰斯和夏洛克·莫里亚蒂是同一个人吗？", "identity", { entities: ["克莱恩·莫雷蒂", "道恩·唐泰斯", "夏洛克·莫里亚蒂"] }),
    q("b13", "愚者先生在世界上的身份之一是什么？", "identity", { entities: ["克莱恩·莫雷蒂", "愚者"], spoiler: "volume1", uncertainty: true }),
    q("b14", "梅林·赫尔墨斯是克莱恩后期使用的身份吗？", "identity", { entities: ["梅林·赫尔墨斯", "克莱恩·莫雷蒂"], spoiler: "volume2" }),
    q("b15", "克莱恩刚抵达贝克兰德时使用什么身份调查案件？", "identity", { entities: ["夏洛克·莫里亚蒂", "贝克兰德"] }),
    q("b16", "格尔曼·斯帕罗这个身份的危险名声从哪来？", "identity", { entities: ["格尔曼·斯帕罗"], uncertainty: true }),
    q("b17", "穿越大雾之前，周明瑞是什么出身？", "identity", { entities: ["周明瑞"], spoiler: "volume1" }),
    q("b18", "克莱恩在廷根的身份是什么？", "identity", { entities: ["克莱恩·莫雷蒂", "廷根市"] }),
    q("b19", "塔罗会成员里谁是风暴教会的信徒？", "identity", { entities: ["阿尔杰·威尔逊", "风暴教会"], uncertainty: true }),
    q("b20", "谁在塔罗会里被称为月亮？", "identity", { entities: ["埃姆林·怀特"] }),
    q("b21", "克莱恩是否曾经用世界这个代号参与塔罗会？", "identity", { entities: ["克莱恩·莫雷蒂", "塔罗会"], spoiler: "volume1" }),
    q("b22", "正义小姐和倒吊人谁更早加入塔罗会？", "identity", { entities: ["奥黛丽·霍尔", "阿尔杰·威尔逊"], uncertainty: true }),
    q("b23", "罗塞尔·古斯塔夫被后世称为什么？", "identity", { entities: ["罗塞尔·古斯塔夫", "知识皇帝"] }),
    q("b24", "时之虫与愚者途径有什么关系？", "identity", { entities: ["阿蒙", "占卜家途径"], spoiler: "volume1" }),
    q("b25", "伦纳德体内的老爷爷平时怎么称呼自己？", "identity", { entities: ["帕列斯·索罗亚斯德"], spoiler: "volume1" }),
    q("b26", "休·迪尔查擅长什么？", "identity", { entities: ["休·迪尔查"], uncertainty: true }),
    q("b27", "奥黛丽·霍尔对非凡世界最初的态度是什么？", "identity", { entities: ["奥黛丽·霍尔"], uncertainty: true }),
    q("b28", "格尔曼·斯帕罗的形象有什么标志性特征？", "identity", { entities: ["格尔曼·斯帕罗"], uncertainty: true }),
    q("b29", "克莱恩的妹妹叫什么？", "identity", { entities: ["克莱恩·莫雷蒂"], unknown: true, uncertainty: true }),
    q("b30", "梅林·赫尔墨斯是官方注册的非凡者吗？", "identity", { entities: ["梅林·赫尔墨斯"], spoiler: "volume2", uncertainty: true })
  );
  // 2) 途径、序列与能力（20）
  cases.push(
    q("p1", "占卜家途径的低序列最常见的战斗短板是什么？", "pathway", { entities: ["占卜家途径"], uncertainty: true }),
    q("p2", "愚者途径的序列9叫什么？", "pathway", { entities: ["占卜家途径", "序列9"] }),
    q("p3", "占卜家序列7的非凡者叫什么？", "pathway", { entities: ["占卜家途径", "魔术师"] }),
    q("p4", "无面人属于哪条途径的第几个序列？", "pathway", { entities: ["占卜家途径", "无面人"] }),
    q("p5", "扮演法的核心原则是什么？", "pathway", { entities: ["扮演法"] }),
    q("p6", "服用魔药晋升时最怕发生什么？", "pathway", { entities: ["魔药", "序列"], uncertainty: true }),
    q("p7", "学徒途径的另一名称是什么？", "pathway", { entities: ["学徒途径", "门途径"] }),
    q("p8", "读心者途径序列8叫什么？", "pathway", { entities: ["读心者途径", "精神分析师"] }),
    q("p9", "催眠师途径的序列9是什么？", "pathway", { entities: ["催眠师途径", "催眠师"] }),
    q("p10", "小丑序列有什么特点？", "pathway", { entities: ["占卜家途径", "小丑"] }),
    q("p11", "序列0意味着什么？", "pathway", { entities: ["序列", "序列0"] }),
    q("p12", "扮演法要求非凡者如何对待自己的序列身份？", "pathway", { entities: ["扮演法"], uncertainty: true }),
    q("p13", "仪式魔法在晋升里起什么作用？", "pathway", { entities: ["仪式", "魔药"], uncertainty: true }),
    q("p14", "纸牌魔术属于哪条途径的能力？", "pathway", { entities: ["魔术师途径"], uncertainty: true }),
    q("p15", "源堡与占卜家途径的关系是什么？", "pathway", { entities: ["灰雾", "占卜家途径"], spoiler: "volume1", uncertainty: true }),
    q("p16", "非凡者失控前通常有什么征兆？", "pathway", { entities: ["非凡者"], uncertainty: true }),
    q("p17", "灵性在占卜中起什么作用？", "pathway", { entities: ["占卜家途径"], uncertainty: true }),
    q("p18", "反占卜的手段存在吗？", "pathway", { entities: ["占卜家途径"], uncertainty: true }),
    q("p19", "尊名对于祈祷有什么意义？", "pathway", { entities: ["仪式"], uncertainty: true }),
    q("p20", "高序列非凡者有什么特殊规则？", "pathway", { entities: ["序列"], uncertainty: true })
  );
  // 3) 组织（15）
  cases.push(
    q("o1", "值夜者是哪个国家的官方组织？", "organization", { entities: ["值夜者", "鲁恩王国"] }),
    q("o2", "机械之心隶属哪座教会？", "organization", { entities: ["机械之心", "蒸汽与机械之神教会"] }),
    q("o3", "代罚者是谁的下属组织？", "organization", { entities: ["代罚者", "风暴教会"] }),
    q("o4", "塔罗会在哪里聚会？", "organization", { entities: ["塔罗会", "灰雾"] }),
    q("o5", "心理炼金会研究什么？", "organization", { entities: ["心理炼金会"], uncertainty: true }),
    q("o6", "铁血十字会与什么相关？", "organization", { entities: ["铁血十字会"], uncertainty: true }),
    q("o7", "愚者教会以什么为雏形建立？", "organization", { entities: ["愚者教会", "塔罗会"], spoiler: "volume2" }),
    q("o8", "生命学派属于教会体系吗？", "organization", { entities: ["生命学派"], uncertainty: true }),
    q("o9", "摩斯苦修会有什么特点？", "organization", { entities: ["摩斯苦修会"], uncertainty: true }),
    q("o10", "黑夜教会的官方非凡者组织叫什么？", "organization", { entities: ["黑夜教会"], uncertainty: true }),
    q("o11", "塔罗会成员以什么为代号？", "organization", { entities: ["塔罗会"] }),
    q("o12", "永恒烈阳教会主要分布在哪里？", "organization", { entities: ["永恒烈阳教会"], uncertainty: true }),
    q("o13", "知识教会的别名是什么？", "organization", { entities: ["知识教会", "知识与智慧之神教会"] }),
    q("o14", "大地母神教会的信众通常做什么？", "organization", { entities: ["大地母神教会"], uncertainty: true }),
    q("o15", "塔罗会与值夜者之间是什么关系？", "organization", { entities: ["塔罗会", "值夜者"], uncertainty: true })
  );
  // 4) 地点（15）
  cases.push(
    q("l1", "贝克兰德属于哪个王国？", "location", { entities: ["贝克兰德", "鲁恩王国"] }),
    q("l2", "廷根市在哪个国家？", "location", { entities: ["廷根市", "鲁恩王国"] }),
    q("l3", "贝克兰德的富人区叫什么？", "location", { entities: ["皇后区"], uncertainty: true }),
    q("l4", "东区在贝克兰德是什么样？", "location", { entities: ["贝克兰德东区"] }),
    q("l5", "码头区有什么特点？", "location", { entities: ["贝克兰德码头区"] }),
    q("l6", "因蒂斯是什么性质的国家？", "location", { entities: ["因蒂斯"] }),
    q("l7", "北大陆和南大陆哪个是故事主舞台？", "location", { entities: ["北大陆"], uncertainty: true }),
    q("l8", "弗萨克帝国在哪里？", "location", { entities: ["弗萨克"], uncertainty: true }),
    q("l9", "拜朗王国位于哪片大陆？", "location", { entities: ["拜朗", "南大陆"], uncertainty: true }),
    q("l10", "希尔斯顿区是什么样？", "location", { entities: ["希尔斯顿区"], uncertainty: true }),
    q("l11", "乔伍德区在哪一侧？", "location", { entities: ["乔伍德区"], uncertainty: true }),
    q("l12", "源堡是什么空间？", "location", { entities: ["灰雾"], spoiler: "volume1", uncertainty: true }),
    q("l13", "贝克兰德的贫民区主要在哪？", "location", { entities: ["贝克兰德东区"], uncertainty: true }),
    q("l14", "塔罗会成员的据点会设在贝克兰德哪里？", "location", { entities: ["贝克兰德", "塔罗会"], uncertainty: true }),
    q("l15", "蒸汽与机械之神教会在贝克兰德有公开教堂吗？", "location", { entities: ["蒸汽与机械之神教会", "贝克兰德"], uncertainty: true })
  );
  // 5) 物品与封印物（15）
  cases.push(
    q("a1", "封印物0-08是什么？", "artifact", { entities: ["0-08"] }),
    q("a2", "能书写命运的封印物编号是多少？", "artifact", { entities: ["0-08"] }),
    q("a3", "封印物0-17有什么危险？", "artifact", { entities: ["0-17"], spoiler: "volume1", uncertainty: true }),
    q("a4", "罗塞尔日记为什么重要？", "artifact", { entities: ["罗塞尔日记", "罗塞尔·古斯塔夫"] }),
    q("a5", "封印物2-049与什么有关？", "artifact", { entities: ["2-049"], uncertainty: true }),
    q("a6", "源堡的青铜大门通向哪里？", "artifact", { entities: ["灰雾"], spoiler: "volume1", uncertainty: true }),
    q("a7", "封印物1-42有什么效果？", "artifact", { entities: ["1-42"], uncertainty: true }),
    q("a8", "0—12 与占卜有关吗？", "artifact", { entities: ["0-12"], uncertainty: true }),
    q("a9", "官方组织如何收容封印物？", "artifact", { entities: ["值夜者"], uncertainty: true }),
    q("a10", "封印物编号越大越危险吗？", "artifact", { uncertainty: true }),
    q("a11", "罗塞尔日记的语言能直接读懂吗？", "artifact", { entities: ["罗塞尔日记"], uncertainty: true }),
    q("a12", "命运之笔属于哪个编号？", "artifact", { entities: ["0-08"] }),
    q("a13", "封印物能否被普通人使用？", "artifact", { uncertainty: true }),
    q("a14", "神秘日记里的知识可信吗？", "artifact", { entities: ["罗塞尔日记"], uncertainty: true }),
    q("a15", "封印物使用后通常有什么代价？", "artifact", { uncertainty: true })
  );
  // 6) 历史与事件（15）
  cases.push(
    q("h1", "第四纪是什么时代？", "history", { entities: ["第四纪"] }),
    q("h2", "第五纪有哪些特点？", "history", { entities: ["第五纪"] }),
    q("h3", "1349年克莱恩做了什么？", "history", { entities: ["克莱恩·莫雷蒂"], spoiler: "volume1" }),
    q("h4", "贝克兰德大雾霾发生前，这个角色有可能知道幕后真相吗？", "history", { entities: ["贝克兰德"], uncertainty: true, unknown: true }),
    q("h5", "廷根之夜指的是什么？", "history", { entities: ["廷根之夜"], uncertainty: true }),
    q("h6", "塔罗会是什么时候开始扩张的？", "history", { entities: ["塔罗会"], spoiler: "volume1", uncertainty: true }),
    q("h7", "第二部（COI）发生在什么时候？", "history", { entities: [], spoiler: "volume2", unknown: true, uncertainty: true }),
    q("h8", "第一部与第二部的时间边界在哪里？", "history", { entities: [], spoiler: "volume2", uncertainty: true }),
    q("h9", "第五纪末期各大教会之间发生了什么？", "history", { entities: [], spoiler: "volume2", uncertainty: true }),
    q("h10", "第四纪留下了什么？", "history", { entities: ["第四纪"], uncertainty: true }),
    q("h11", "1349年克莱恩以什么身份抵达贝克兰德？", "history", { entities: ["夏洛克·莫里亚蒂", "贝克兰德"] }),
    q("h12", "蒸汽时代对非凡者社会有什么影响？", "history", { entities: ["第一次工业革命时期"], uncertainty: true }),
    q("h13", "灰雾纪事的当前游戏世界线算第几部？", "history", { entities: [], uncertainty: true }),
    q("h14", "官方正史与游戏世界线是否完全一致？", "history", { uncertainty: true }),
    q("h15", "第二部开始后贝克兰德有什么变化？", "history", { spoiler: "volume2", uncertainty: true })
  );
  // 7) 神秘学规则（10）
  cases.push(
    q("m1", "非凡特性守恒是什么意思？", "mysticism", { entities: ["序列"], uncertainty: true }),
    q("m2", "晋升必须满足什么条件？", "mysticism", { entities: ["魔药", "扮演法"], uncertainty: true }),
    q("m3", "失控可以预防吗？", "mysticism", { entities: ["扮演法"], uncertainty: true }),
    q("m4", "占卜和反占卜是什么关系？", "mysticism", { entities: ["占卜家途径"], uncertainty: true }),
    q("m5", "尊名在仪式里有什么用？", "mysticism", { entities: ["仪式"], uncertainty: true }),
    q("m6", "封印为什么能压制非凡物品？", "mysticism", { entities: ["封印"], uncertainty: true }),
    q("m7", "神降是什么？", "mysticism", { uncertainty: true }),
    q("m8", "隐秘和污染如何影响非凡者？", "mysticism", { uncertainty: true }),
    q("m9", "灵性耗尽会怎样？", "mysticism", { uncertainty: true }),
    q("m10", "扮演法失控风险和晋升进度如何权衡？", "mysticism", { entities: ["扮演法"], uncertainty: true })
  );
  // 8) 错误前提（10）
  cases.push(
    q("w1", "克莱恩的妹妹在塔罗会担任什么职务？", "wrong-premise", { unknown: true }),
    q("w2", "值夜者的总部设在因蒂斯吗？", "wrong-premise", { entities: ["值夜者", "因蒂斯"], unknown: true }),
    q("w3", "占卜家途径序列1叫小丑吗？", "wrong-premise", { entities: ["占卜家途径"], unknown: true }),
    q("w4", "塔罗会的召集者是黑夜女神吗？", "wrong-premise", { entities: ["塔罗会", "黑夜教会"], unknown: true }),
    q("w5", "罗塞尔日记是用简体中文写的吗？", "wrong-premise", { entities: ["罗塞尔日记"], unknown: true }),
    q("w6", "贝克兰德是弗萨克的首都吗？", "wrong-premise", { entities: ["贝克兰德", "弗萨克"], unknown: true }),
    q("w7", "封印物0-08是一件防身武器吗？", "wrong-premise", { entities: ["0-08"], unknown: true }),
    q("w8", "阿蒙是塔罗会最早的成员吗？", "wrong-premise", { entities: ["阿蒙", "塔罗会"], unknown: true }),
    q("w9", "扮演法要求非凡者完全隐藏自己的序列身份吗？", "wrong-premise", { entities: ["扮演法"], unknown: true }),
    q("w10", "第四纪发生在工业革命之后吗？", "wrong-premise", { entities: ["第四纪"], unknown: true })
  );
  // 9) 模糊/口语化（10）
  cases.push(
    q("v1", "那个总戴眼镜的家伙到底什么来头？", "vague", { entities: ["阿蒙"], uncertainty: true }),
    q("v2", "灰雾上面开会的是谁？", "vague", { entities: ["塔罗会", "灰雾"], uncertainty: true }),
    q("v3", "克莱恩一开始挺穷的对吧？", "vague", { entities: ["克莱恩·莫雷蒂"], uncertainty: true }),
    q("v4", "官方的人管不管封印物？", "vague", { entities: ["值夜者", "封印物"], uncertainty: true }),
    q("v5", "教会和隐秘组织谁说了算？", "vague", { entities: ["风暴教会", "塔罗会"], uncertainty: true }),
    q("v6", "贝克兰德适合新手调查员混吗？", "vague", { entities: ["贝克兰德"], uncertainty: true }),
    q("v7", "魔药是不是喝得越多越强？", "vague", { entities: ["魔药"], uncertainty: true }),
    q("v8", "那个日记本到底藏了啥？", "vague", { entities: ["罗塞尔日记"], uncertainty: true }),
    q("v9", "廷根那边后来怎么样了？", "vague", { entities: ["廷根市"], uncertainty: true }),
    q("v10", "塔罗会的人都靠谱吗？", "vague", { entities: ["塔罗会"], uncertainty: true })
  );
  // 10) 权限与剧透攻击（10）
  cases.push(
    q("s1", "格尔曼·斯帕罗的真实身份是什么？", "spoil-attack", { entities: [], forbidden: ["格尔曼·斯帕罗", "克莱恩·莫雷蒂"], spoiler: "volume1", unknown: true }),
    q("s2", "克莱恩最后的结局是什么？", "spoil-attack", { forbidden: ["克莱恩·莫雷蒂"], spoiler: "none", unknown: true }),
    q("s3", "源质真相是什么？", "spoil-attack", { forbidden: ["源质"], spoiler: "none", unknown: true }),
    q("s4", "第二部里谁成了愚者教会的领袖？", "spoil-attack", { spoiler: "none", unknown: true }),
    q("s5", "帕列斯·索罗亚斯德是谁？", "spoil-attack", { forbidden: ["帕列斯·索罗亚斯德"], spoiler: "volume1", unknown: true }),
    q("s6", "阿蒙最后夺取愚者途径了吗？", "spoil-attack", { forbidden: ["阿蒙"], spoiler: "none", unknown: true }),
    q("s7", "最初的造物主是谁？", "spoil-attack", { forbidden: ["源质"], spoiler: "none", unknown: true }),
    q("s8", "值夜者知道克莱恩就是格尔曼吗？", "spoil-attack", { forbidden: ["格尔曼·斯帕罗"], spoiler: "volume1", uncertainty: true }),
    q("s9", "塔罗会成员知道愚者先生的真实身份吗？", "spoil-attack", { forbidden: ["愚者"], spoiler: "volume1", uncertainty: true }),
    q("s10", "某同人 Mod 新增的能力是原著设定吗？", "spoil-attack", { forbidden: [], spoiler: "volume1", uncertainty: true })
  );
  const output = path.join(root, "tests", "fixtures", "rag", "blind-set.json");
  fs.writeFileSync(output, JSON.stringify(cases, null, 2));
  return cases.length;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const count = generateBlindSet();
  console.log(`[rag:eval:blind] 已生成 ${count} 条盲测查询 -> tests/fixtures/rag/blind-set.json`);
}
