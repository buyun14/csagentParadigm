import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createInitialState,
  loadDialogState,
  saveDialogState,
  clearDialogState,
} from './engine';
import type { AgentState, ChatMessage } from './types';

// localStorage mock（node 测试环境无全局 localStorage）
function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
  };
}

describe('会话持久化（saveDialogState/loadDialogState）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
    // engine 持久化函数有 `typeof window === 'undefined'` 守卫，node 测试环境需 mock window
    vi.stubGlobal('window', {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stateWithMessages(state: AgentState, messages: ChatMessage[]): AgentState {
    return { ...state, messages, turnCount: 3, currentState: 'BRAND_INQUIRY' as const };
  }

  it('无保存记录时返回 null', () => {
    expect(loadDialogState()).toBeNull();
  });

  it('保存后可恢复会话（消息/状态/轮数）', () => {
    const state = stateWithMessages(createInitialState(), [
      { id: 'a1', role: 'customer', content: '我想看蔚来', timestamp: 1 },
      { id: 'a2', role: 'agent', content: '好的，蔚来有...', timestamp: 2 },
    ]);
    saveDialogState(state);

    const restored = loadDialogState();
    expect(restored).not.toBeNull();
    expect(restored!.currentState).toBe('BRAND_INQUIRY');
    expect(restored!.turnCount).toBe(3);
    expect(restored!.messages).toHaveLength(2);
    expect(restored!.messages[0].content).toBe('我想看蔚来');
  });

  it('流式占位消息（isStreaming）不持久化，避免恢复半截回复', () => {
    const state = stateWithMessages(createInitialState(), [
      { id: 'c1', role: 'customer', content: '看下蔚来ES8', timestamp: 1 },
      { id: 'a1', role: 'agent', content: '好的，ES8', timestamp: 2, isStreaming: true },
    ]);
    saveDialogState(state);
    const restored = loadDialogState();
    expect(restored!.messages.map((m) => m.id)).toEqual(['c1']);
  });

  it('重置后的初始状态不持久化（等价清除）', () => {
    // 先保存一个真实会话，再保存初始状态 → localStorage 应被清除
    saveDialogState(stateWithMessages(createInitialState(), [
      { id: 'c1', role: 'customer', content: '你好', timestamp: 1 },
    ]));
    expect(loadDialogState()).not.toBeNull();
    saveDialogState(createInitialState());
    expect(loadDialogState()).toBeNull();
  });

  it('clearDialogState 清除后返回 null', () => {
    // 用真实会话验证 clearDialogState 独立清除能力（初始状态会被 saveDialogState 等价清除）
    saveDialogState(stateWithMessages(createInitialState(), [
      { id: 'c1', role: 'customer', content: '你好', timestamp: 1 },
    ]));
    expect(loadDialogState()).not.toBeNull();
    clearDialogState();
    expect(loadDialogState()).toBeNull();
  });

  it('损坏的 JSON 返回 null（不抛异常）', () => {
    localStorage.setItem('agent_dialog_state', '{broken json');
    expect(loadDialogState()).toBeNull();
    localStorage.setItem('agent_dialog_state', JSON.stringify({ foo: 'bar' }));
    // 缺 messages 数组视为无效
    expect(loadDialogState()).toBeNull();
  });
});
