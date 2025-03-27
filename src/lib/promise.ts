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

  public die() {
    const now = Date.now()
    this.argMap.forEach((value, key) => {
      if ((now - value) > 10000) {
        this.argMap.delete(key)
      }
    })
  }

  public kill(...args: any[]) {
    const key = hash(args)
    this.argMap.delete(key)
  }
  /**
   * Dedupe a function call
   * if false, the function call will be skipped
   */
  async dedupe(...args: any[]) {
    const key = hash(args)
    
    await asyncTimeout(0)

    const lastCall = this.argMap.get(key)
    if (lastCall && lastCall > (Date.now() - 1000)) {
      console.log('[DedupeThing] Subsequent call, skipping')
      return false;
    } else if (lastCall) {
      this.kill(...args)
    }
    this.argMap.set(key, Date.now())
    return true;
  }
}

