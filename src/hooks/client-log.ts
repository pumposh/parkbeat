// Logging system
export class WebSocketLogger {
    private static instance: WebSocketLogger
    private activeHandlers: Set<string> = new Set()
    private logBuffer: Array<{ timestamp: Date, message: string, type: 'info' | 'error' | 'debug' }> = []
    private flushInterval: NodeJS.Timeout
  
    private constructor() {
      this.flushInterval = setInterval(() => this.flushLogs(), 1000)
    }
  
    static getInstance(): WebSocketLogger {
      if (!WebSocketLogger.instance) {
        WebSocketLogger.instance = new WebSocketLogger()
      }
      return WebSocketLogger.instance
    }
  
    registerHandler(id: string) {
      this.activeHandlers.add(id)
      this.log('debug', `Handler registered: ${id}. Active handlers: ${this.activeHandlers.size}`)
    }
  
    unregisterHandler(id: string) {
      this.activeHandlers.delete(id)
      this.log('debug', `Handler unregistered: ${id}. Active handlers: ${this.activeHandlers.size}`)
    }
  
    log(type: 'info' | 'error' | 'debug', message: string) {
      this.logBuffer.push({
        timestamp: new Date(),
        message,
        type
      })
    }
  
    private flushLogs() {
      if (this.logBuffer.length === 0) return
  
      const groupedLogs = this.logBuffer.reduce((acc, log) => {
        const logs = acc[log.type] || []
        acc[log.type] = [...logs, log]
        return acc
      }, {} as Record<string, typeof this.logBuffer>)
  
      console.group(`WebSocket Logs (Active Handlers: ${this.activeHandlers.size})`)
      
      Object.entries(groupedLogs).forEach(([type, logs]) => {
        console.group(type.toUpperCase())
        logs.forEach(log => {
          const time = log.timestamp.toISOString().split('T')[1]?.slice(0, -1)
          console.log(`[${time}] ${log.message}`)
        })
        console.groupEnd()
      })
      
      console.groupEnd()
      this.logBuffer = []
    }
  
    cleanup() {
      clearInterval(this.flushInterval)
    }
  }
  