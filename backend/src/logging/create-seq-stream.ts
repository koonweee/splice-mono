import type { DestinationStream } from 'pino';

type PinoSeq = typeof import('pino-seq');
type PinoSeqModule = PinoSeq | { default: PinoSeq };

interface CreateSeqStreamOptions {
  serverUrl: string;
  apiKey?: string;
}

export async function createSeqStream({
  serverUrl,
  apiKey,
}: CreateSeqStreamOptions): Promise<DestinationStream> {
  const pinoSeqModule = (await import('pino-seq')) as unknown as PinoSeqModule;
  const pinoSeq =
    'default' in pinoSeqModule ? pinoSeqModule.default : pinoSeqModule;

  return pinoSeq.createStream({
    serverUrl,
    apiKey,
  });
}
