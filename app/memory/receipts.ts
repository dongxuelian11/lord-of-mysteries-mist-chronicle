// 统一模型调用回执入口：成功且被业务层接受后提交 delivered，必要时再提交 presented。
import {
  markMemoryPresented,
  submitMemoryDelivery,
  type MemoryReceiptDescriptor,
} from "./derive.ts";
import type { DynamicMemoryState, MemoryAudience } from "./types.ts";

export function actorAudience(actorId: string, affectsActivation = true): MemoryAudience {
  return { kind: "actor", actorId, affectsActivation };
}

export function factionAudience(factionId: string, affectsActivation = true): MemoryAudience {
  return { kind: "faction", factionId, affectsActivation };
}

export function playerAudience(affectsActivation = false): MemoryAudience {
  return { kind: "player", affectsActivation };
}

export function narratorAudience(): MemoryAudience {
  return { kind: "narrator", affectsActivation: false };
}

export function worldSystemAudience(): MemoryAudience {
  return { kind: "world-system", affectsActivation: false };
}

export async function runAcceptedModelCall<T>(
  options: {
    state: DynamicMemoryState;
    descriptor: MemoryReceiptDescriptor;
    invoke: () => Promise<unknown>;
    validate: (value: unknown) => T;
  }
): Promise<{ value: T; memory: DynamicMemoryState }> {
  const raw = await options.invoke();
  const value = options.validate(raw);
  let memory = submitMemoryDelivery(options.state, options.descriptor);
  if (options.descriptor.audience.affectsActivation) {
    memory = markMemoryPresented(memory, options.descriptor);
  }
  return { value, memory };
}
