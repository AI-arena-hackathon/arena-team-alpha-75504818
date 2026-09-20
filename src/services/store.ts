import { ClickEvent, ActivationEvent, StitchedEvent } from '../types';

export class InMemoryStore {
  private clicks: ClickEvent[] = [];
  private activations: ActivationEvent[] = [];
  private stitched: StitchedEvent[] = [];

  addClick(click: ClickEvent): void {
    this.clicks.push(click);
  }

  addActivation(activation: ActivationEvent): void {
    this.activations.push(activation);
  }

  getClicks(): ClickEvent[] {
    return [...this.clicks];
  }

  getActivations(): ActivationEvent[] {
    return [...this.activations];
  }

  getClicksBySessionId(sessionId: string): ClickEvent[] {
    return this.clicks.filter(c => c.sessionId === sessionId);
  }

  getActivationsByUserId(userId: string): ActivationEvent[] {
    return this.activations.filter(a => a.userId === userId);
  }

  getUnmatchedClicks(): ClickEvent[] {
    const matchedSessionIds = new Set(this.stitched.map(s => s.clickEvent.sessionId));
    return this.clicks.filter(c => !matchedSessionIds.has(c.sessionId));
  }

  getUnmatchedActivations(): ActivationEvent[] {
    const matchedUserIds = new Set(this.stitched.map(s => s.activationEvent.userId));
    return this.activations.filter(a => !matchedUserIds.has(a.userId));
  }

  addStitchedEvent(stitched: StitchedEvent): void {
    this.stitched.push(stitched);
  }

  getStitchedEvents(): StitchedEvent[] {
    return [...this.stitched];
  }

  clearStitched(): void {
    this.stitched = [];
  }

  clear(): void {
    this.clicks = [];
    this.activations = [];
    this.stitched = [];
  }
}

export const store = new InMemoryStore();