import { EventEmitter } from 'node:events';
import https from 'node:https';
import webPush from 'web-push';
import { WebPushAdapter } from '../../src/notification/web-push.adapter';

jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    generateRequestDetails: jest.fn().mockReturnValue({
      endpoint: 'https://push.example.test/synthetic',
      method: 'POST',
      headers: {},
      body: Buffer.from('encrypted fixture'),
    }),
  },
}));

describe('WebPushAdapter bounded transport', () => {
  let request: EventEmitter & {
    destroy: jest.Mock;
    end: jest.Mock;
    setTimeout: jest.Mock;
  };
  let response: EventEmitter & { statusCode: number };
  let adapter: WebPushAdapter;
  const environment = { ...process.env };
  beforeEach(() => {
    jest.useFakeTimers();
    process.env.VAPID_PUBLIC_KEY = 'synthetic';
    process.env.VAPID_PRIVATE_KEY = 'synthetic';
    process.env.VAPID_SUBJECT = 'mailto:test@example.test';
    request = Object.assign(new EventEmitter(), {
      destroy: jest.fn((error: Error) => request.emit('error', error)),
      end: jest.fn(),
      setTimeout: jest.fn(),
    });
    response = Object.assign(new EventEmitter(), { statusCode: 201 });
    jest.spyOn(https, 'request').mockImplementation(((
      _url: unknown,
      _options: unknown,
      callback: (response: unknown) => void,
    ) => {
      queueMicrotask(() => callback(response));
      return request;
    }) as any);
    adapter = new WebPushAdapter();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
    process.env = { ...environment };
  });

  function send() {
    return adapter.send(
      {
        endpoint: 'https://push.example.test',
        p256dh: 'synthetic',
        auth: 'synthetic',
      } as any,
      {
        title: 'Synthetic',
        body: 'Synthetic',
        url: '/accounts',
        tag: 'fixture',
      },
      3600,
    );
  }
  it('destroys a connection that never completes at the total deadline', async () => {
    const pending = send();
    const rejected = expect(pending).rejects.toThrow(
      'Push total deadline exceeded',
    );
    await jest.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(request.destroy).toHaveBeenCalledTimes(1);
    expect(request.setTimeout).toHaveBeenCalledWith(3000, expect.any(Function));
  });
  it('also aborts a response that continuously drips data', async () => {
    const pending = send();
    const rejected = expect(pending).rejects.toThrow(
      'Push total deadline exceeded',
    );
    for (let index = 0; index < 5; index++) {
      await jest.advanceTimersByTimeAsync(999);
      response.emit('data', Buffer.from('x'));
    }
    await jest.advanceTimersByTimeAsync(5);
    await rejected;
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });
  it('settles a healthy response and clears the deadline', async () => {
    const pending = send();
    await jest.advanceTimersByTimeAsync(0);
    response.emit('end');
    await pending;
    await jest.advanceTimersByTimeAsync(10000);
    expect(request.destroy).not.toHaveBeenCalled();
    expect(webPush.generateRequestDetails).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.any(String),
      { TTL: 3600 },
    );
  });
  it('destroys an oversized response without capturing its body', async () => {
    const pending = send();
    const rejected = expect(pending).rejects.toThrow(
      'Push response exceeded limit',
    );
    await jest.advanceTimersByTimeAsync(0);
    response.emit('data', Buffer.alloc(65 * 1024, 'x'));
    await rejected;
    expect(request.destroy).toHaveBeenCalledTimes(1);
  });
  it.each([302, 404, 503])(
    'classifies status %i without following redirects or leaking content',
    async (statusCode) => {
      const pending = send();
      await jest.advanceTimersByTimeAsync(0);
      response.statusCode = statusCode;
      response.emit('end');
      await expect(pending).rejects.toMatchObject({
        statusCode,
        message: 'Push provider rejected delivery',
      });
      expect(https.request).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps expired endpoint status without returning provider response content', async () => {
    const pending = send();
    await jest.advanceTimersByTimeAsync(0);
    response.statusCode = 410;
    response.emit('data', Buffer.from('private provider body'));
    response.emit('end');
    await expect(pending).rejects.toMatchObject({
      statusCode: 410,
      message: 'Push provider rejected delivery',
    });
  });
});
