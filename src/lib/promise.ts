import hash from 'object-hash'
import { asyncTimeout } from './async';

type timestamp = number;

export class DedupeThing {
  static getInstance(): DedupeThing {
    if (!DedupeThing.instance) {
      console.log('[DedupeThing] Creating new singleton instance');
      DedupeThing.instance = new DedupeThing();
    }
    return DedupeThing.instance;
  }

  private static instance: DedupeThing | null = null;

  private argMap: Map<string, timestamp> = new Map();

  private cleanMap() {
    const now = Date.now()
    this.argMap.forEach((value, key) => {
      if (now - value > 1000) {
        this.argMap.delete(key)
      }
    })
  }
  async dedupe(...args: any[]) {
    const key = hash(args)
    
    await asyncTimeout(0)

    const lastCall = this.argMap.get(key)
    if (lastCall && lastCall > (Date.now() - 1000)) {
      console.log('[DedupeThing] Subsequent call, skipping')
      this.cleanMap()
      return false;
    }
    this.argMap.set(key, Date.now())
    return true;
  }
}

