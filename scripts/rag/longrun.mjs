// 长线运行验证：固定种子 + 确定性 mock 模型，跑 20 周与 50 周。
// 检查：无未捕获异常、存档可序列化/恢复、上下文有界、知识/事件增长有界、
// 恢复后的存档可继续推进。
import { createServer } from "vite";

let moduleServer;

async function loadModules() {
  moduleServer ??= await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  const engine = await moduleServer.ssrLoadModule("/app/game-engine.ts");
  const model = await moduleServer.ssrLoadModule("/app/game-model.ts");
  return { engine, model };
}

const VARIANTS = [
  {
    atmosphere: "清晨的雾比往常更浓，工厂烟囱排出的黑烟在街口凝成水珠，报童的喊声比平时更急。",
    signals: [
      { channel: "报纸", headline: "东区三家工厂同时停工", body: "三家工厂以锅炉检修为由停工，工人被挡在门外等待新的排班通知，门口聚集了打听消息的人。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "警察厅开始核对失踪人口", body: "辖区警察开始询问近期离开住所却没有向房东说明去向的住户，登记簿新增三项。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "行业消息", headline: "外港货船等待检查", body: "两班原定清晨入港的货船被要求停在外港，卸货时间没有得到解释。", reliability: "多源传闻", districtId: "dock" },
    ],
    moves: [
      { title: "撤换联络点", detail: "该势力撤掉一处已使用多周的联络点，并把文书分散交给三名信使。", visibility: "迹象" },
      { title: "交叉核对救济名册", detail: "该势力调取旧人口档案，与近期慈善救济名册进行交叉核对。", visibility: "获知" },
    ],
    canon: "在约定的钟楼下会见了旧识，谈话内容没有第三人在场。",
    events: [
      { id: "e-a", title: "工厂停工", detail: "东区三家工厂同时关闭侧门，工人被要求在家等待通知。", districtId: "east" },
      { id: "e-b", title: "人口登记", detail: "警察厅开始整理失踪人口登记，并约谈了几位房东。", districtId: "cherwood" },
      { id: "e-c", title: "外港滞留", detail: "两艘货船留在外港，船主收到口头通知等待检查。", districtId: "dock" },
    ],
    location: "街口出现更多巡警，摊贩开始提前收摊。",
    milestone: "取得下一项可检验结果",
  },
  {
    atmosphere: "午后的阳光被云层压得很低，码头方向传来断断续续的汽笛，交易所门前排起了长队。",
    signals: [
      { channel: "街谈", headline: "码头工人拒绝上工", body: "清晨换班时工人没有登上驳船，工头在岸边喊话，称工资结算出了差错。", reliability: "公开事实", districtId: "dock" },
      { channel: "行业消息", headline: "两家银行收紧贷款", body: "抵押贷款的窗口排起长队，职员以总行复核为由要求补充账册。", reliability: "多源传闻", districtId: "hillston" },
      { channel: "私人来信", headline: "教会巡夜时间提前", body: "值夜者把巡街时间提前到黄昏，慈善厨房门口贴出新的施粥安排。", reliability: "单一消息", districtId: "south" },
    ],
    moves: [
      { title: "收买码头工头", detail: "该势力通过中间人向码头工头许诺报酬，换取卸货排班与货单副本。", visibility: "迹象" },
      { title: "转移核心账册", detail: "该势力把一批账册从商行搬到私人宅邸，并销毁了部分目录页。", visibility: "迹象" },
    ],
    canon: "派人送出一封盖有私章的信，收信人没有回话，只在门缝留下半张报纸。",
    events: [
      { id: "e-a", title: "码头罢运", detail: "早班工人集体拒绝上船，港区卸货陷入停滞。", districtId: "dock" },
      { id: "e-b", title: "银行复核", detail: "两家银行开始要求贷款客户补充原始账册。", districtId: "hillston" },
      { id: "e-c", title: "巡夜提前", detail: "值夜者把慈善厨房一带的巡街时间提前到黄昏。", districtId: "south" },
    ],
    location: "码头铁门落锁，交易所门口有人低声议论贷款利率。",
    milestone: "确认下一批货物的实际买主",
  },
  {
    atmosphere: "入夜后风从河面灌进来，煤气路灯忽明忽暗，几家印刷所的窗口亮到很晚。",
    signals: [
      { channel: "报纸", headline: "晚报开设失踪者专版", body: "晚报第三版开始连载失踪工人名册，称愿意刊登家属来信，编辑部电话无人接听。", reliability: "公开事实", districtId: "west" },
      { channel: "行业消息", headline: "黑市药材价格翻倍", body: "几味用于仪式的药材在暗巷涨到原价两倍，货主拒绝说明来源。", reliability: "单一消息", districtId: "bridge" },
      { channel: "官方通告", headline: "煤气公司检修主干管", body: "煤气公司以例行检修名义封闭三条主干管，工人在夜间更换阀门。", reliability: "公开事实", districtId: "government" },
    ],
    moves: [
      { title: "销毁旧名单", detail: "该势力把一份旧名单分批丢进不同的锅炉，并清点了仍在流传的副本。", visibility: "迹象" },
      { title: "建立码头新泊位", detail: "该势力在另一处泊位挂出新的卸货代理招牌，用假名登记。", visibility: "获知" },
    ],
    canon: "在印刷所附近出现，拿走一叠样报后没有停留，去向不明。",
    events: [
      { id: "e-a", title: "失踪专栏", detail: "晚报开始连载失踪工人名册，并征集家属来信。", districtId: "west" },
      { id: "e-b", title: "药材涨价", detail: "暗巷里几种仪式药材价格翻倍，货主拒绝说明来源。", districtId: "bridge" },
      { id: "e-c", title: "管道检修", detail: "煤气公司封闭三条主干管，夜间更换阀门。", districtId: "government" },
    ],
    location: "印刷所灯火通明，煤气路灯在风里忽明忽暗。",
    milestone: "定位下一批仪式材料的转运点",
  },
  {
    atmosphere: "傍晚的雨把招牌洗得发亮，剧院散场的人群被拦在侧巷外，有马车绕道而行。",
    signals: [
      { channel: "报纸", headline: "剧院侧巷发现无名包裹", body: "清洁工在剧院侧巷发现一只没有署名的包裹，巡警到场后封锁了巷口。", reliability: "公开事实", districtId: "queens" },
      { channel: "官方通告", headline: "当铺暂停收当", body: "桥区两家当铺以盘点为名暂停收当，柜台后的帘子始终拉紧。", reliability: "公开事实", districtId: "bridge" },
      { channel: "行业消息", headline: "印刷订单突然增多", body: "西区印刷所接到多笔匿名订单，要求加印某种封皮，工头拒绝透露委托方。", reliability: "多源传闻", districtId: "west" },
    ],
    moves: [
      { title: "收编报馆线人", detail: "该势力通过旧关系在报馆安插一名线人，负责抄录第三版排印记录。", visibility: "获知" },
      { title: "转移当票凭证", detail: "该势力把一批当票凭证从桥区运往码头仓库，并更换了封存蜡印。", visibility: "迹象" },
    ],
    canon: "在剧院二楼包厢停留片刻，离开时留下半截烟蒂。",
    events: [
      { id: "e-a", title: "无名包裹", detail: "剧院侧巷出现无名包裹，巡警封锁巷口。", districtId: "queens" },
      { id: "e-b", title: "当铺停当", detail: "桥区两家当铺暂停收当，柜台后的帘子拉紧。", districtId: "bridge" },
      { id: "e-c", title: "匿名订单", detail: "西区印刷所接到多笔匿名订单，要求加印特殊封皮。", districtId: "west" },
    ],
    location: "剧院散场的人群被拦在侧巷外，马车绕道而行。",
    milestone: "查清无名包裹的寄送路径",
  },
  {
    atmosphere: "清晨的码头弥漫着鱼腥味，潮水退去后露出新的淤滩，几只野猫在缆绳间穿梭。",
    signals: [
      { channel: "街谈", headline: "淤滩出现新货物", body: "退潮后的淤滩出现一批散落的木箱，码头工人说昨晚没有船只靠岸。", reliability: "公开事实", districtId: "dock" },
      { channel: "行业消息", headline: "当铺收到金表", body: "桥区当铺今早收进一只刻有家族纹章的金表，店员说顾客戴着兜帽。", reliability: "单一消息", districtId: "bridge" },
      { channel: "官方通告", headline: "市政厅更换地籍册", body: "市政厅以勘误为由更换东区地籍册，旧册被集中封存。", reliability: "公开事实", districtId: "east" },
    ],
    moves: [
      { title: "重排码头岗哨", detail: "该势力调整码头岗哨的换班时间，让夜间卸货避开巡逻。", visibility: "迹象" },
      { title: "收购当票", detail: "该势力通过掮客收购桥区当铺流出的当票，并登记了持票人特征。", visibility: "获知" },
    ],
    canon: "在码头仓库外遇见一名旧部，双方只交换了眼神。",
    events: [
      { id: "e-a", title: "淤滩木箱", detail: "退潮后的淤滩出现散落木箱，工人称昨夜无船靠岸。", districtId: "dock" },
      { id: "e-b", title: "金表入当", detail: "桥区当铺收进刻有纹章的金表，顾客戴着兜帽。", districtId: "bridge" },
      { id: "e-c", title: "地籍更换", detail: "市政厅更换东区地籍册，旧册封存。", districtId: "east" },
    ],
    location: "码头弥漫鱼腥味，潮水退去后露出新的淤滩。",
    milestone: "核对金表纹章对应的家族",
  },
  {
    atmosphere: "冬日的黄昏来得早，教堂钟声比平时晚了半刻，长椅上坐着几个低头的人。",
    signals: [
      { channel: "报纸", headline: "教堂募捐账目被质疑", body: "南区慈善厨房的募捐账目被匿名信质疑，教会宣布将公开复核。", reliability: "公开事实", districtId: "south" },
      { channel: "官方通告", headline: "银行金库临时封库", body: "希尔斯顿一家银行宣布金库临时封库，取款需提前三日预约。", reliability: "公开事实", districtId: "hillston" },
      { channel: "行业消息", headline: "旧书商大量收书", body: "桥区旧书商开始大量收购宗教与历史类旧书，出价高于市价。", reliability: "多源传闻", districtId: "bridge" },
    ],
    moves: [
      { title: "安插教堂耳目", detail: "该势力在慈善厨房安排一名杂工，记录进出人员的面孔。", visibility: "迹象" },
      { title: "调取金库排班", detail: "该势力通过银行职员获取金库换班表，标注了交接窗口。", visibility: "获知" },
    ],
    canon: "在教堂后廊等候，随后与一名执事简短交谈。",
    events: [
      { id: "e-a", title: "账目质疑", detail: "慈善厨房募捐账目被匿名信质疑，教会宣布公开复核。", districtId: "south" },
      { id: "e-b", title: "金库封库", detail: "银行宣布金库临时封库，取款需预约。", districtId: "hillston" },
      { id: "e-c", title: "旧书收购", detail: "旧书商大量收购宗教与历史类旧书，出价高于市价。", districtId: "bridge" },
    ],
    location: "教堂钟声比平时晚了半刻，长椅上坐着几个低头的人。",
    milestone: "确认账目质疑的匿名信来源",
  },
  {
    atmosphere: "春雾散去的午后，证券交易所的铃声比往常更密集，街角有人分发传单。",
    signals: [
      { channel: "报纸", headline: "交易所出现异常抛售", body: "午后交易所出现一轮异常抛售，几家大额卖单来自同一家经纪行。", reliability: "公开事实", districtId: "government" },
      { channel: "行业消息", headline: "纺织厂裁撤夜班", body: "乔伍德区纺织厂裁撤夜班，工人在厂门外张贴请愿书。", reliability: "公开事实", districtId: "cherwood" },
      { channel: "官方通告", headline: "卫生局抽查井水", body: "卫生局开始抽查各区井水，皇后区优先，结果未公布。", reliability: "公开事实", districtId: "queens" },
    ],
    moves: [
      { title: "吸纳抛售股票", detail: "该势力通过分散账户吸纳异常抛售的股票，并记录对手方信息。", visibility: "获知" },
      { title: "接触纺织工人", detail: "该势力派人与夜班工人接触，收集请愿书上的签名分布。", visibility: "迹象" },
    ],
    canon: "在交易所对面的咖啡馆观察了一下午，没有与任何人交谈。",
    events: [
      { id: "e-a", title: "异常抛售", detail: "交易所出现一轮异常抛售，卖单来自同一家经纪行。", districtId: "government" },
      { id: "e-b", title: "夜班裁撤", detail: "纺织厂裁撤夜班，工人在厂门外张贴请愿书。", districtId: "cherwood" },
      { id: "e-c", title: "井水抽查", detail: "卫生局抽查各区井水，皇后区优先。", districtId: "queens" },
    ],
    location: "交易所铃声密集，街角有人分发传单。",
    milestone: "追踪异常抛售的资金链路",
  },
  {
    atmosphere: "秋雨连绵，孤儿院的铁门半掩，孩子们被提前带回宿舍，院子里晾着湿透的床单。",
    signals: [
      { channel: "报纸", headline: "孤儿院收到匿名捐赠", body: "东区孤儿院收到一笔匿名捐赠，院长拒绝透露捐赠方式。", reliability: "公开事实", districtId: "east" },
      { channel: "官方通告", headline: "档案室失火", body: "市政档案室夜间失火，受灾范围限于旧户籍区，官方称损失轻微。", reliability: "公开事实", districtId: "government" },
      { channel: "行业消息", headline: "药店新到一批药", body: "桥区药店新到一批没有标签的药瓶，店员称来自外地。", reliability: "单一消息", districtId: "bridge" },
    ],
    moves: [
      { title: "转移孤儿院记录", detail: "该势力复制了孤儿院近年的接收记录，并抹去了部分登记者姓名。", visibility: "迹象" },
      { title: "收购无标药瓶", detail: "该势力通过中间人收购无标药瓶，按瓶底编号分类存放。", visibility: "获知" },
    ],
    canon: "在孤儿院侧门停留片刻，把一封信塞进门缝。",
    events: [
      { id: "e-a", title: "匿名捐赠", detail: "东区孤儿院收到匿名捐赠，院长拒绝透露方式。", districtId: "east" },
      { id: "e-b", title: "档案室失火", detail: "市政档案室夜间失火，旧户籍区受灾。", districtId: "government" },
      { id: "e-c", title: "无标药瓶", detail: "桥区药店新到一批无标签药瓶，称来自外地。", districtId: "bridge" },
    ],
    location: "孤儿院铁门半掩，院子里晾着湿透的床单。",
    milestone: "核对匿名捐赠的经手人",
  },
  {
    atmosphere: "盛夏的傍晚雷雨将至，钟表店的橱窗亮着，街面上行人稀少，只有马车匆匆驶过。",
    signals: [
      { channel: "报纸", headline: "钟表店提前打烊", body: "皇后区钟表店在雷雨前提前打烊，店员说店主临时外出。", reliability: "公开事实", districtId: "queens" },
      { channel: "行业消息", headline: "码头夜班加人", body: "码头夜班临时加人，工头说是有大宗货物要在天亮前装船。", reliability: "多源传闻", districtId: "dock" },
      { channel: "官方通告", headline: "地方法院延期开庭", body: "地方法院宣布两桩案件延期开庭，案卷被调往更高一级法院。", reliability: "公开事实", districtId: "government" },
    ],
    moves: [
      { title: "核对钟表店账本", detail: "该势力派人抄录钟表店近月的进出账，重点核对定制表壳的买家。", visibility: "获知" },
      { title: "安排夜班装卸", detail: "该势力通过工头安排夜班装卸，把货物混入普通批次。", visibility: "迹象" },
    ],
    canon: "在钟表店对面等待雷雨过后才离开。",
    events: [
      { id: "e-a", title: "钟表店打烊", detail: "皇后区钟表店提前打烊，店主临时外出。", districtId: "queens" },
      { id: "e-b", title: "夜班加人", detail: "码头夜班临时加人，准备天亮前装船。", districtId: "dock" },
      { id: "e-c", title: "案件延期", detail: "地方法院两桩案件延期，案卷上调。", districtId: "government" },
    ],
    location: "钟表店橱窗亮着，街面上行人稀少。",
    milestone: "锁定定制表壳的买家身份",
  },
  {
    atmosphere: "深秋的清晨，雾散后露出教堂尖顶，桥区的河水涨到台阶边，有人在下游打捞。",
    signals: [
      { channel: "街谈", headline: "河里捞起铁箱", body: "桥区下游捞起一只铁箱，箱盖焊死，围观者被巡警驱散。", reliability: "公开事实", districtId: "bridge" },
      { channel: "报纸", headline: "晚报撤回昨日报道", body: "晚报撤回了关于失踪者专版的报道，编辑部称系笔误。", reliability: "公开事实", districtId: "west" },
      { channel: "行业消息", headline: "面粉铺停售", body: "南区面粉铺停售三天，店主说货源被统一调走。", reliability: "单一消息", districtId: "south" },
    ],
    moves: [
      { title: "打捞铁箱情报", detail: "该势力安排人手在打捞现场附近记录围观者与巡警的对话。", visibility: "迹象" },
      { title: "锁定晚报编辑", detail: "该势力确认了负责撤回报道的编辑身份，并跟踪其下班路线。", visibility: "获知" },
    ],
    canon: "在桥下租了一条小船，沿河观察了半日。",
    events: [
      { id: "e-a", title: "铁箱出水", detail: "桥区下游捞起焊死的铁箱，围观者被驱散。", districtId: "bridge" },
      { id: "e-b", title: "报道撤回", detail: "晚报撤回失踪者专版报道，称系笔误。", districtId: "west" },
      { id: "e-c", title: "面粉停售", detail: "南区面粉铺停售三天，货源被统一调走。", districtId: "south" },
    ],
    location: "河水涨到台阶边，有人在下游打捞。",
    milestone: "确认铁箱的打捞位置与去向",
  },
  {
    atmosphere: "初春的午后阳光稀薄，银行门口排着长队，有人把怀表反复拿出来看时间。",
    signals: [
      { channel: "报纸", headline: "银行新设保险箱业务", body: "希尔斯顿银行新设保险箱业务，最低租期一年，不接受匿名。", reliability: "公开事实", districtId: "hillston" },
      { channel: "官方通告", headline: "税务员换人", body: "东区税务员换人，新职员开始逐户核对铺面面积。", reliability: "公开事实", districtId: "east" },
      { channel: "行业消息", headline: "当铺赎回率上升", body: "桥区当铺的赎回率突然上升，店员说有人集中赎回旧表。", reliability: "多源传闻", districtId: "bridge" },
    ],
    moves: [
      { title: "租用保险箱", detail: "该势力以商行名义租用保险箱，分批存放重要文书副本。", visibility: "迹象" },
      { title: "跟踪税务员", detail: "该势力跟踪新税务员的核对路线，记录其停留的铺面。", visibility: "获知" },
    ],
    canon: "在银行对面的长椅上等待，直到打烊才离开。",
    events: [
      { id: "e-a", title: "保险箱业务", detail: "希尔斯顿银行新设保险箱业务，不接受匿名。", districtId: "hillston" },
      { id: "e-b", title: "税务换人", detail: "东区税务员换人，开始逐户核对铺面。", districtId: "east" },
      { id: "e-c", title: "赎回上升", detail: "桥区当铺赎回率上升，有人集中赎回旧表。", districtId: "bridge" },
    ],
    location: "银行门口排着长队，有人反复看怀表。",
    milestone: "摸清保险箱业务的登记流程",
  },
  {
    atmosphere: "冬夜的风很硬，路灯下没有行人，只有一辆马车停在印刷所后门。",
    signals: [
      { channel: "行业消息", headline: "印刷所后门夜车", body: "西区印刷所后门连续两夜停着同一辆马车，装卸的箱子没有标记。", reliability: "多源传闻", districtId: "west" },
      { channel: "官方通告", headline: "市政厅封存旧照", body: "市政厅以维护为名封存一批旧照片档案，摄影协会表示不满。", reliability: "公开事实", districtId: "government" },
      { channel: "街谈", headline: "码头工人换班表调整", body: "码头工人换班表再次调整，白班推迟一小时，夜班提前。", reliability: "公开事实", districtId: "dock" },
    ],
    moves: [
      { title: "记录夜车路线", detail: "该势力记录了夜车的出发时间与路线，发现其停在废弃仓库附近。", visibility: "获知" },
      { title: "复制旧照片", detail: "该势力通过档案室旧人复制了一批封存照片的清单。", visibility: "迹象" },
    ],
    canon: "在印刷所后门附近停留，等马车离开后才走。",
    events: [
      { id: "e-a", title: "夜车装卸", detail: "印刷所后门连续两夜停着同一辆马车，箱子没有标记。", districtId: "west" },
      { id: "e-b", title: "旧照封存", detail: "市政厅封存一批旧照片档案。", districtId: "government" },
      { id: "e-c", title: "换班调整", detail: "码头换班表再次调整，白班推迟一小时。", districtId: "dock" },
    ],
    location: "路灯下没有行人，只有马车停在印刷所后门。",
    milestone: "确认夜车的卸货仓库",
  },
];

function variantFor(week) {
  const base = VARIANTS[week % VARIANTS.length];
  const tag = String(week + 1).padStart(2, "0");
  const suffix = (text) => `${text}（第${tag}周记录）`;
  return {
    ...base,
    atmosphere: suffix(base.atmosphere),
    signals: base.signals.map((signal) => ({
      ...signal,
      headline: suffix(signal.headline),
      body: `${signal.body}（第${tag}周）`,
    })),
    moves: base.moves.map((move, index) => ({
      ...move,
      title: `${move.title}·${tag}`,
      detail: `${move.detail}（第${tag}周，阶段${(week + index) % 5 + 1}）`,
    })),
    canon: suffix(base.canon),
    events: base.events.map((event) => ({
      ...event,
      id: `${event.id}-${tag}`,
      title: suffix(event.title),
      detail: `${event.detail}（第${tag}周）`,
    })),
    location: suffix(base.location),
    milestone: suffix(base.milestone),
  };
}

function worldEnvelope(game, chapter, tag) {
  const [firstFaction, secondFaction] = game.factions;
  const locationId = game.worldKernel.locations[0].id;
  const projectIds = game.worldKernel.projects.slice(0, 2).map((item) => item.id);
  const result = chapter.results[0];
  const variant = variantFor(Number(tag));
  return {
    worldSummary: {
      atmosphere: variant.atmosphere,
      changes: [variant.signals[0].headline, variant.signals[1].headline],
      undercurrents: ["两股势力开始交换消息", "港口出现新的货单流向"],
    },
    publicSignals: variant.signals.map((signal) => ({ ...signal })),
    actionReports: result
      ? [{
          actionId: result.id,
          fieldReport: `${variant.signals[0].headline}出现后，执行者按契约只核对公开记录，没有接触任何人。`,
          observableFacts: [variant.signals[0].body.slice(0, 40), variant.signals[1].body.slice(0, 40)],
          followUp: "核验最近一周的公开登记与报纸索引",
        }]
      : [],
    factionMoves: [
      { factionId: firstFaction.id, title: variant.moves[0].title, detail: variant.moves[0].detail, visibility: variant.moves[0].visibility, suspicionDelta: 1, progressDelta: 2 },
      { factionId: secondFaction.id, title: variant.moves[1].title, detail: variant.moves[1].detail, visibility: variant.moves[1].visibility, suspicionDelta: 0, progressDelta: 3 },
    ],
    canonMoves: [{ actorId: game.canonActors[0].id, lastMove: variant.canon, awareness: "未知" }],
    emergentPressure: null,
    emergentLead: null,
    organizationDelta: {
      departmentDevelopments: [],
      memberDevelopments: [],
      recruitDevelopments: [],
      governanceIssues: [],
      newRecruitableNpc: null,
    },
    kernelDelta: {
      newActors: [], newFactions: [], newProjects: [],
      actorUpdates: [], factionUpdates: [],
      projectUpdates: projectIds.map((projectId, index) => ({
        projectId,
        progressDelta: 2 + index,
        stage: "继续推进",
        nextMilestone: variant.milestone,
        blockers: [],
        status: "active",
      })),
      locationUpdates: [{ locationId, riskDelta: 1, stabilityDelta: 0, publicMood: "不安", condition: variant.location }],
      events: variant.events.map((event) => ({
        ...event,
        id: `event-${tag}-${event.id}`,
        locationId: event.districtId,
        actorIds: [],
        factionIds: event.id === "e-a" ? [firstFaction.id] : event.id === "e-b" ? [secondFaction.id] : [],
        causeIds: [],
        visibility: "world",
      })),
      observations: [], knowledge: [],
      canon: { mode: "anchored", deviationDelta: 0, pivotEventIds: [] },
    },
  };
}

async function runWeeks(totalWeeks) {
  const { engine, model } = await loadModules();
  const { generateAiWorldDelta, generateLiteraryChapter, localContract, resolveWeek, scheduleContract } = engine;
  const { createInitialGame } = model;
  let game = createInitialGame("spectator");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  const contextSizes = [];
  let maxContext = 0;
  try {
    for (let week = 1; week <= totalWeeks; week += 1) {
      const tag = String(week + 1);
      game = { ...game, money: (game.money ?? 0) + 30 };
      const contract = localContract({
        intent: `第${tag}周整理本周公开报纸资料，只做比对，不接触任何人。`,
        game,
        leaderId: "organization",
        districtId: "cherwood",
        abilityIds: [],
      });
      game = { ...game, schedule: [scheduleContract(game, contract)] };
      const resolved = resolveWeek(game);
      const envelope = worldEnvelope(resolved.state, resolved.chapter, tag);
      const chapterJson = JSON.stringify({
        title: `第${tag}周：雾中纪事`,
        sections: [
          {
            heading: "开端",
            paragraphs: [`第${tag}周，雨落在窗沿上。`, "负责人听完汇报后留在据点，没有外出。"],
          },
        ],
      });
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? "{}"));
        const user = body.messages?.[1]?.content ?? "";
        try {
          const payloadText = user.slice(user.lastIndexOf("\n{") + 1);
          const payload = JSON.parse(payloadText);
          const loreLength = String(payload?.authorizedLore ?? "").length;
          contextSizes.push(loreLength);
          if (loreLength > maxContext) maxContext = loreLength;
        } catch {
          // 无法解析 payload，跳过上下文采样
        }
        const content = user.includes("worldSummary") ? JSON.stringify(envelope) : chapterJson;
        return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
      };
      const simulated = await generateAiWorldDelta(
        { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
        resolved.state,
        resolved.chapter,
        () => {},
      );
      const enriched = simulated.chronicle.find((chapter) => chapter.id === resolved.chapter.id) ?? resolved.chapter;
      const literary = await generateLiteraryChapter(
        { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
        simulated,
        enriched,
        () => {},
      );
      game = {
        ...simulated,
        chronicle: simulated.chronicle.map((chapter) =>
          chapter.id === literary.id ? literary : chapter
        ),
      };
    }
    return {
      game,
      contextSizes,
      maxContext,
      weeks: totalWeeks,
    };
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

function invariants(result) {
  const game = result.game;
  const serialized = JSON.stringify(game);
  const restored = JSON.parse(serialized);
  const checks = {
    serializable: serialized.length > 0,
    restoreKeepsWeek: restored.week === game.week,
    chronicleMatches: restored.chronicle.length === game.chronicle.length,
    knowledgeBounded: (game.worldKernel?.knowledge?.length ?? 0) <= 1200,
    eventsBounded: (game.worldKernel?.events?.length ?? 0) <= 2500,
    maxContextBounded: result.maxContext <= 24000,
    factsBounded: (game.facts?.length ?? 0) <= 2000,
    snapshotBounded: (game.worldSnapshots?.length ?? 0) <= result.weeks + 2,
  };
  checks.all = Object.values(checks).every(Boolean);
  return { checks, saveBytes: serialized.length };
}

export async function runLongrun() {
  const output = [];
  for (const weeks of [20, 50]) {
    const result = await runWeeks(weeks);
    const inv = invariants(result);
    output.push({
      weeks,
      week: result.game.week,
      chronicle: result.game.chronicle.length,
      saveBytes: inv.saveBytes,
      knowledge: result.game.worldKernel?.knowledge?.length ?? 0,
      events: result.game.worldKernel?.events?.length ?? 0,
      facts: result.game.facts?.length ?? 0,
      snapshots: result.game.worldSnapshots?.length ?? 0,
      maxLoreContext: result.maxContext,
      avgLoreContext: Math.round(
        result.contextSizes.reduce((s, v) => s + v, 0) / Math.max(1, result.contextSizes.length)
      ),
      checks: inv.checks,
    });
    // 恢复存档后继续推进 1 周
    const restored = JSON.parse(JSON.stringify(result.game));
    const { engine, model } = await loadModules();
    const { generateAiWorldDelta, localContract, resolveWeek, scheduleContract } = engine;
    const { createInitialGame } = model;
    void createInitialGame;
    const originalFetch = globalThis.fetch;
    globalThis.window = globalThis;
    const contract = localContract({
      intent: "恢复存档后继续整理公开资料",
      game: restored,
      leaderId: "organization",
      districtId: "cherwood",
      abilityIds: [],
    });
    const resumed = { ...restored, schedule: [scheduleContract(restored, contract)] };
    const resolved = resolveWeek(resumed);
    const envelope = worldEnvelope(resolved.state, resolved.chapter, String(resolved.state.week + 1));
    const chapterJson = JSON.stringify({
      title: `恢复后续写：第${resolved.state.week + 1}周`,
      sections: [{ heading: "续写", paragraphs: ["存档恢复后，游戏继续推进。"] }],
    });
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      const user = body.messages?.[1]?.content ?? "";
      const content = user.includes("worldSummary") ? JSON.stringify(envelope) : chapterJson;
      return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) };
    };
    const simulated = await generateAiWorldDelta(
      { provider: "compatible", endpoint: "https://model.invalid/v1", apiKey: "test-key", model: "test-model" },
      resolved.state,
      resolved.chapter,
      () => {},
    );
    output[output.length - 1].resumeAdvancedTo = simulated.week;
    globalThis.fetch = originalFetch;
  }
  if (moduleServer) await moduleServer.close();
  return output;
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
  const results = await runLongrun();
  let allPass = true;
  for (const item of results) {
    console.log(
      `[rag:longrun] ${item.weeks} 周：week=${item.week} chronicle=${item.chronicle} save=${(item.saveBytes / 1024).toFixed(1)}KB knowledge=${item.knowledge} events=${item.events} facts=${item.facts} snapshots=${item.snapshots} maxLore=${item.maxLoreContext} avgLore=${item.avgLoreContext} resumeTo=${item.resumeAdvancedTo}`
    );
    console.log(`[rag:longrun] ${item.weeks} 周校验：${JSON.stringify(item.checks)}`);
    if (!item.checks.all) allPass = false;
  }
  console.log(`[rag:longrun] RESULT=${allPass ? "PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
}
