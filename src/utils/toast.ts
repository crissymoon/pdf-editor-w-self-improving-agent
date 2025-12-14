import type { Toast, ToastType } from '../types';

class ToastManager {
  private container: HTMLElement | null = null;
  private toasts: Toast[] = [];

  init(): void {
    if (this.container) return;

    this.container = document.createElement('div');
    this.container.className = 'toast-container';
    document.body.appendChild(this.container);
  }

  show(message: string, type: ToastType = 'info', duration: number = 3000): void {
    this.init();

    const id = crypto.randomUUID();
    const toast: Toast = { id, message, type };
    this.toasts.push(toast);

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    toastEl.id = `toast-${id}`;
    toastEl.textContent = message;

    this.container?.appendChild(toastEl);

    setTimeout(() => {
      this.remove(id);
    }, duration);
  }

  remove(id: string): void {
    const toastEl = document.getElementById(`toast-${id}`);
    if (toastEl) {
      toastEl.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => {
        toastEl.remove();
        this.toasts = this.toasts.filter(t => t.id !== id);
      }, 300);
    }
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error', 5000);
  }

  warning(message: string): void {
    this.show(message, 'warning');
  }

  info(message: string): void {
    this.show(message, 'info');
  }
}

export const toast = new ToastManager();
