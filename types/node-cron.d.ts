declare module 'node-cron' {
  interface ScheduleOptions {
    timezone?: string;
    scheduled?: boolean;
    name?: string;
  }

  interface ScheduledTask {
    start(): void;
    stop(): void;
    destroy(): void;
  }

  function schedule(
    expression: string,
    func: (now: Date | 'manual' | 'init') => void,
    options?: ScheduleOptions
  ): ScheduledTask;

  function validate(expression: string): boolean;

  export { schedule, validate, ScheduledTask };
  export default { schedule, validate };
}
