/**
 * Client-side bridge for the Image Processing Web Worker.
 * Handles concurrency, request cancellation, and transferable ArrayBuffer management.
 */

import type { WorkerFilterRequest, WorkerFilterResponse } from '../workers/filter.worker';

export interface ImageAdjustments {
  brightness: number; // -50 to +50
  contrast: number;   // -50 to +50
  warmth: number;     // -50 to +50
  sharpness: number;  // 0 to 100
}

class FilterWorkerClientManager {
  private worker: Worker | null = null;
  private currentRequestId = 0;
  private pendingResolvers = new Map<
    string,
    {
      resolve: (imageData: ImageData) => void;
      reject: (err: Error) => void;
    }
  >();

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    try {
      if (typeof window !== 'undefined' && window.Worker) {
        this.worker = new Worker(
          new URL('../workers/filter.worker.ts', import.meta.url),
          { type: 'module' }
        );

        this.worker.onmessage = (e: MessageEvent<WorkerFilterResponse>) => {
          const { id, success, width, height, buffer, error } = e.data;
          const callbacks = this.pendingResolvers.get(id);
          if (!callbacks) return;
          this.pendingResolvers.delete(id);

          if (success) {
            const clamped = new Uint8ClampedArray(buffer);
            const resImageData = new ImageData(clamped, width, height);
            callbacks.resolve(resImageData);
          } else {
            callbacks.reject(new Error(error || 'Worker processing failed'));
          }
        };

        this.worker.onerror = (err) => {
          console.error('FilterWorker error:', err);
        };
      }
    } catch (e) {
      console.warn('Could not initialize Web Worker, falling back to main thread', e);
      this.worker = null;
    }
  }

  /**
   * Process an ImageData object in the background worker thread.
   * Transfers the pixel buffer to avoid memory cloning overhead.
   */
  public process(
    sourceImageData: ImageData,
    filterId: string,
    adjustments?: ImageAdjustments
  ): Promise<ImageData> {
    const id = (++this.currentRequestId).toString();

    // Cancel prior pending calls if they exist
    for (const [pendingId, cb] of this.pendingResolvers.entries()) {
      cb.reject(new Error('SUPERSEDED'));
      this.pendingResolvers.delete(pendingId);
    }

    if (!this.worker) {
      return Promise.reject(new Error('NO_WORKER'));
    }

    return new Promise<ImageData>((resolve, reject) => {
      this.pendingResolvers.set(id, { resolve, reject });

      // Clone buffer to send transferable copy so caller's original canvas is safe
      const w = sourceImageData.width;
      const h = sourceImageData.height;
      const copyBuffer = new ArrayBuffer(sourceImageData.data.byteLength);
      new Uint8ClampedArray(copyBuffer).set(sourceImageData.data);

      const request: WorkerFilterRequest = {
        id,
        width: w,
        height: h,
        buffer: copyBuffer,
        filterId,
        adjustments,
      };

      this.worker!.postMessage(request, [copyBuffer]);
    });
  }
}

export const FilterWorkerClient = new FilterWorkerClientManager();
