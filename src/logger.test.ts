import { createLogger, createNullLogger, LogLevel } from './logger';

describe('createLogger', () => {
  let stdoutWrite: jest.SpyInstance;
  let stderrWrite: jest.SpyInstance;

  beforeEach(() => {
    stdoutWrite = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    stderrWrite = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutWrite.mockRestore();
    stderrWrite.mockRestore();
  });

  it('emits JSON to stdout for info', () => {
    const log = createLogger(LogLevel.INFO);
    log.info('test message', { key: 'val' });
    expect(stdoutWrite).toHaveBeenCalledTimes(1);
    const line = (stdoutWrite.mock.calls[0][0] as string).trim();
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('test message');
    expect(parsed.key).toBe('val');
    expect(parsed.timestamp).toBeDefined();
  });

  it('emits to stderr for error and warn', () => {
    const log = createLogger(LogLevel.DEBUG);
    log.error('err');
    log.warn('wrn');
    expect(stderrWrite).toHaveBeenCalledTimes(2);
    expect(stdoutWrite).toHaveBeenCalledTimes(0);
  });

  it('respects minimum log level', () => {
    const log = createLogger(LogLevel.WARN);
    log.debug('no');
    log.info('no');
    log.warn('yes');
    log.error('yes');
    expect(stderrWrite).toHaveBeenCalledTimes(2);
    expect(stdoutWrite).toHaveBeenCalledTimes(0);
  });

  it('debug level shows all', () => {
    const log = createLogger(LogLevel.DEBUG);
    log.debug('d');
    log.info('i');
    log.warn('w');
    log.error('e');
    expect(stdoutWrite).toHaveBeenCalledTimes(2); // debug + info
    expect(stderrWrite).toHaveBeenCalledTimes(2); // warn + error
  });
});

describe('createNullLogger', () => {
  it('does not write anything', () => {
    const stdoutWrite = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    const log = createNullLogger();
    log.info('test');
    log.error('test');
    log.warn('test');
    log.debug('test');
    expect(stdoutWrite).not.toHaveBeenCalled();
    stdoutWrite.mockRestore();
  });
});
