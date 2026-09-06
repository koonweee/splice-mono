const { Worker } = require('node:worker_threads');

/** Separate sampling thread can observe process RSS while the application CPU is busy. */
async function startMemoryObserver() {
  const observer = new Worker(
    `
    const { parentPort } = require('node:worker_threads');
    let peakRss = process.memoryUsage.rss();
    let samples = 1;
    const timer = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage.rss()); samples++; }, 5);
    parentPort.on('message', () => { clearInterval(timer); parentPort.postMessage({ peakRss, samples, intervalMs: 5 }); });
    parentPort.postMessage({ ready: true });
  `,
    { eval: true },
  );
  await new Promise((resolve, reject) => {
    observer.once('message', resolve);
    observer.once('error', reject);
  });
  return {
    async stop() {
      const result = await new Promise((resolve, reject) => {
        observer.once('message', resolve);
        observer.once('error', reject);
        observer.postMessage('stop');
      });
      await observer.terminate();
      return result;
    },
  };
}

module.exports = { startMemoryObserver };
