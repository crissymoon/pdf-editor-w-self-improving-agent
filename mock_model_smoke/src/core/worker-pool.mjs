import path from "node:path";
import { Worker } from "node:worker_threads";

export class WorkerPool {
  constructor(options) {
    const { workerFile, size, maxQueue } = options;
    this.workerFile = path.resolve(workerFile);
    this.size = Math.max(1, Number(size));
    this.maxQueue = Math.max(1, Number(maxQueue));
    this.workers = [];
    this.idleWorkers = [];
    this.queue = [];
    this.pendingByWorker = new Map();

    for (let i = 0; i < this.size; i += 1) {
      const worker = new Worker(this.workerFile);
      worker.on("message", (message) => this.handleMessage(worker, message));
      worker.on("error", (error) => this.handleWorkerError(worker, error));
      worker.on("exit", (code) => this.handleWorkerExit(worker, code));
      this.workers.push(worker);
      this.idleWorkers.push(worker);
    }
  }

  submit(payload) {
    if (this.queue.length >= this.maxQueue) {
      return Promise.reject(new Error(`Worker queue overflow. maxQueue=${this.maxQueue}`));
    }

    return new Promise((resolve, reject) => {
      const job = { payload, resolve, reject };
      const worker = this.idleWorkers.pop();

      if (worker) {
        this.dispatch(worker, job);
        return;
      }

      this.queue.push(job);
    });
  }

  async close() {
    const terms = this.workers.map((worker) => worker.terminate());
    await Promise.allSettled(terms);
  }

  dispatch(worker, job) {
    this.pendingByWorker.set(worker, job);
    worker.postMessage(job.payload);
  }

  handleMessage(worker, message) {
    const pending = this.pendingByWorker.get(worker);
    if (!pending) {
      return;
    }

    this.pendingByWorker.delete(worker);

    if (message.ok) {
      pending.resolve(message);
    } else {
      pending.reject(new Error(message.error || "Worker request failed."));
    }

    const next = this.queue.shift();
    if (next) {
      this.dispatch(worker, next);
      return;
    }

    this.idleWorkers.push(worker);
  }

  handleWorkerError(worker, error) {
    const pending = this.pendingByWorker.get(worker);
    if (pending) {
      pending.reject(error);
      this.pendingByWorker.delete(worker);
    }
  }

  handleWorkerExit(worker, code) {
    if (code === 0) {
      return;
    }

    const pending = this.pendingByWorker.get(worker);
    if (pending) {
      pending.reject(new Error(`Worker exited with code ${code}`));
      this.pendingByWorker.delete(worker);
    }
  }
}
