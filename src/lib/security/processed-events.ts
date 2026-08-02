export interface ProcessedEventDeduplicator {
  claim(externalEventId: string): boolean;
  release(externalEventId: string): void;
}

export class InMemoryProcessedEventDeduplicator implements ProcessedEventDeduplicator {
  private readonly claimedEventIds = new Set<string>();

  claim(externalEventId: string): boolean {
    if (this.claimedEventIds.has(externalEventId)) {
      return false;
    }

    this.claimedEventIds.add(externalEventId);
    return true;
  }

  release(externalEventId: string): void {
    this.claimedEventIds.delete(externalEventId);
  }

  clear(): void {
    this.claimedEventIds.clear();
  }
}

// TODO: Replace this process-local store with durable n8n Data Table storage before
// running more than one live application instance.
export const linqProcessedEvents = new InMemoryProcessedEventDeduplicator();
