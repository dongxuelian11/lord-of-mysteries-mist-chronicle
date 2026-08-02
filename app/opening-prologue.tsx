"use client";

import { useState } from "react";
import { ArrowRight, CloudFog, Eye, KeyRound, ShieldAlert } from "lucide-react";
import { GameState, PATHWAYS, PathwayId } from "./game-model";

type Props = {
  game: GameState;
  onBegin: (name: string, address: string, pathwayId: PathwayId) => void;
};

export default function OpeningPrologue({ game, onBegin }: Props) {
  const [name, setName] = useState(game.playerName);
  const [address, setAddress] = useState(game.playerAddress || "会长阁下");
  const [pathwayId, setPathwayId] = useState<PathwayId>(game.pathwayId);
  const valid = name.trim().length >= 2 && address.trim().length >= 2;
  const sequence = PATHWAYS[pathwayId].sequences.find((item) => item.rank === game.currentSequence)!;

  return <div className="prologue-backdrop">
    <section className="prologue-modal" role="dialog" aria-modal="true" aria-labelledby="prologue-title">
      <div className="prologue-visual" aria-hidden="true"><CloudFog /><span /><i /><b /></div>
      <div className="prologue-content">
        <header><p>1349年6月30日 · 贝克兰德</p><h1 id="prologue-title">雨夜之后，第一场密议</h1><span>在廷根，一名本不该醒来的人刚刚睁开双眼。数百里外，没有人知道那意味着什么。</span></header>
        <div className="prologue-story">
          <p>凌晨三点，一名陌生信使把黑玻璃挂坠和一份被雨水浸透的工人名单塞进事务所门缝。等守夜人追到街口，马车还在，信使却像从雾中被抹去了。</p>
          <p>现在，挂坠被锁在地下储藏间。那里没有第二扇门，它却连续两夜传出敲门声。名单最后三行使用了不同墨水，三名工人都来自东区，也都已经失踪。</p>
          <p>四名成员正在密议室等你。你们没有教会许可，也尚未成为官方重点监控对象。第一项决议会告诉他们：这个组织究竟要成为什么。</p>
        </div>
        <section className="prologue-status"><label><Eye size={16} /><span><small>开局途径 · 序列{game.currentSequence} {sequence.name}</small><select value={pathwayId} onChange={(event) => setPathwayId(event.target.value as PathwayId)}>{Object.values(PATHWAYS).map((pathway) => <option key={pathway.id} value={pathway.id}>{pathway.name}途径 · 序列9 {pathway.sequences.find((item) => item.rank === 9)?.name}</option>)}</select></span></label><div><ShieldAlert size={16} /><span><small>组织处境</small><strong>未获许可 · 尚未重点监控</strong></span></div></section>
        <form onSubmit={(event) => { event.preventDefault(); if (valid) onBegin(name.trim(), address.trim(), pathwayId); }}>
          <div className="identity-heading"><KeyRound size={16} /><span><strong>在会议记录上留下身份</strong><small>姓名会进入证件、旧识、通缉与真名暴露玩法；称谓决定成员如何正式称呼你。</small></span></div>
          <div className="identity-fields"><label><span>姓名或长期化名</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：亚瑟·莫里亚蒂" maxLength={32} /></label><label><span>成员对你的正式称谓</span><input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="例如：会长阁下" maxLength={24} /></label></div>
          <footer><span>姓名暴露度将随你的公开行动改变，未来也可以建立新化名。</span><button type="submit" disabled={!valid}>推门入席 <ArrowRight size={16} /></button></footer>
        </form>
      </div>
    </section>
  </div>;
}
