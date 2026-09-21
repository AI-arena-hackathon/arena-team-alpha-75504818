import { ClickEvent, ActivationEvent, StitchedEvent, AuditExportRow, AuditExportOptions } from '../types';
import { getStorage, StorageBackend } from './storage';

export class Store {
  private storage: StorageBackend;

  constructor(storage?: StorageBackend) {
    this.storage = storage || getStorage();
  }

  addClick(click: ClickEvent): void {
    this.storage.addClick(click);
  }

  addActivation(activation: ActivationEvent): void {
    this.storage.addActivation(activation);
  }

  getClicks(): ClickEvent[] {
    return this.storage.getClicks() as any;
  }

  getActivations(): ActivationEvent[] {
    return this.storage.getActivations() as any;
  }

  async getClicksAsync(): Promise<ClickEvent[]> {
    return this.storage.getClicks();
  }

  async getActivationsAsync(): Promise<ActivationEvent[]> {
    return this.storage.getActivations();
  }

  getClicksBySessionId(sessionId: string): ClickEvent[] {
    return this.storage.getClicksBySessionId(sessionId) as any;
  }

  getActivationsByUserId(userId: string): ActivationEvent[] {
    return this.storage.getActivationsByUserId(userId) as any;
  }

  async getClicksBySessionIdAsync(sessionId: string): Promise<ClickEvent[]> {
    return this.storage.getClicksBySessionId(sessionId);
  }

  async getActivationsByUserIdAsync(userId: string): Promise<ActivationEvent[]> {
    return this.storage.getActivationsByUserId(userId);
  }

  getUnmatchedClicks(): ClickEvent[] {
    return this.storage.getUnmatchedClicks() as any;
  }

  getUnmatchedActivations(): ActivationEvent[] {
    return this.storage.getUnmatchedActivations() as any;
  }

  async getUnmatchedClicksAsync(): Promise<ClickEvent[]> {
    return this.storage.getUnmatchedClicks();
  }

  async getUnmatchedActivationsAsync(): Promise<ActivationEvent[]> {
    return this.storage.getUnmatchedActivations();
  }

  addStitchedEvent(stitched: StitchedEvent): void {
    this.storage.addStitchedEvent(stitched);
  }

  getStitchedEvents(): StitchedEvent[] {
    return this.storage.getStitchedEvents() as any;
  }

  async getStitchedEventsAsync(): Promise<StitchedEvent[]> {
    return this.storage.getStitchedEvents();
  }

  clearStitched(): void {
    this.storage.clearStitched();
  }

  async clearStitchedAsync(): Promise<void> {
    return this.storage.clearStitched();
  }

  clear(): void {
    this.storage.clear();
  }

  async clearAsync(): Promise<void> {
    return this.storage.clear();
  }

  exportAuditData(options: AuditExportOptions = {}): AuditExportRow[] {
    return this.storage.exportAuditData(options) as any;
  }

  async exportAuditDataAsync(options: AuditExportOptions = {}): Promise<AuditExportRow[]> {
    return this.storage.exportAuditData(options);
  }

  async close(): Promise<void> {
    return this.storage.close();
  }
}

export const store = new Store();