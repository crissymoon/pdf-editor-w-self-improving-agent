/**
 * Responsive Design Utility Module
 * Handles viewport detection, breakpoints, and responsive layout adjustments
 * Works across all devices: phones, tablets, desktops
 */

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface Breakpoints {
  mobile: number;    // < 640px
  tablet: number;    // 640px - 1024px
  desktop: number;   // >= 1024px
}

export interface ViewportDimensions {
  width: number;
  height: number;
  isPortrait: boolean;
  isLandscape: boolean;
}

export interface ResponsiveState {
  deviceType: DeviceType;
  viewport: ViewportDimensions;
  breakpoints: Breakpoints;
  isTouchDevice: boolean;
  pixelRatio: number;
}

/**
 * Default breakpoints for responsive design
 */
const DEFAULT_BREAKPOINTS: Breakpoints = {
  mobile: 640,
  tablet: 1024,
  desktop: 1024,
};

/**
 * Responsive utility singleton class
 */
class ResponsiveManager {
  private static instance: ResponsiveManager | null = null;
  private listeners: Set<(state: ResponsiveState) => void> = new Set();
  private breakpoints: Breakpoints = { ...DEFAULT_BREAKPOINTS };
  private isTouchDevice: boolean = false;
  private currentState: ResponsiveState;

  private constructor() {
    this.isTouchDevice = this.detectTouchDevice();
    this.currentState = this.buildState();
    this.init();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ResponsiveManager {
    if (!ResponsiveManager.instance) {
      ResponsiveManager.instance = new ResponsiveManager();
    }
    return ResponsiveManager.instance;
  }

  /**
   * Initialize responsive listeners
   */
  private init(): void {
    // Listen to window resize
    window.addEventListener('resize', () => this.updateState());
    
    // Listen to orientation change
    window.addEventListener('orientationchange', () => this.updateState());
    
    // Listen to viewport meta changes
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      new MutationObserver(() => this.updateState()).observe(viewport, {
        attributes: true,
        attributeFilter: ['content'],
      });
    }
  }

  /**
   * Detect if device supports touch
   */
  private detectTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    
    return (
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      matchMedia('(hover: none)').matches
    );
  }

  /**
   * Get current viewport dimensions
   */
  private getViewportDimensions(): ViewportDimensions {
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    
    return {
      width,
      height,
      isPortrait: height >= width,
      isLandscape: width > height,
    };
  }

  /**
   * Determine device type from viewport width
   */
  private getDeviceType(width: number): DeviceType {
    if (width < this.breakpoints.mobile) return 'mobile';
    if (width < this.breakpoints.tablet) return 'tablet';
    return 'desktop';
  }

  /**
   * Build current responsive state
   */
  private buildState(): ResponsiveState {
    const viewport = this.getViewportDimensions();
    
    return {
      deviceType: this.getDeviceType(viewport.width),
      viewport,
      breakpoints: { ...this.breakpoints },
      isTouchDevice: this.isTouchDevice,
      pixelRatio: window.devicePixelRatio || 1,
    };
  }

  /**
   * Update state and notify listeners
   */
  private updateState(): void {
    const newState = this.buildState();
    
    // Only notify if state actually changed
    if (
      newState.deviceType !== this.currentState.deviceType ||
      newState.viewport.width !== this.currentState.viewport.width ||
      newState.viewport.height !== this.currentState.viewport.height ||
      newState.viewport.isPortrait !== this.currentState.viewport.isPortrait
    ) {
      this.currentState = newState;
      this.notifyListeners();
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.currentState);
      } catch (error) {
        console.error('Error in responsive listener:', error);
      }
    });
  }

  /**
   * Subscribe to responsive state changes
   * Returns unsubscribe function
   */
  subscribe(listener: (state: ResponsiveState) => void): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener(this.currentState);
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get current responsive state
   */
  getState(): ResponsiveState {
    return { ...this.currentState };
  }

  /**
   * Check if current device type matches given type
   */
  isDeviceType(type: DeviceType): boolean {
    return this.currentState.deviceType === type;
  }

  /**
   * Check if device is mobile
   */
  isMobile(): boolean {
    return this.currentState.deviceType === 'mobile';
  }

  /**
   * Check if device is tablet
   */
  isTablet(): boolean {
    return this.currentState.deviceType === 'tablet';
  }

  /**
   * Check if device is desktop
   */
  isDesktop(): boolean {
    return this.currentState.deviceType === 'desktop';
  }

  /**
   * Check if device is portrait orientation
   */
  isPortrait(): boolean {
    return this.currentState.viewport.isPortrait;
  }

  /**
   * Check if device is landscape orientation
   */
  isLandscape(): boolean {
    return this.currentState.viewport.isLandscape;
  }

  /**
   * Get width in pixels
   */
  getWidth(): number {
    return this.currentState.viewport.width;
  }

  /**
   * Get height in pixels
   */
  getHeight(): number {
    return this.currentState.viewport.height;
  }

  /**
   * Check if breakpoint is exceeded
   */
  isAboveBreakpoint(breakpoint: keyof Breakpoints): boolean {
    return this.currentState.viewport.width >= this.breakpoints[breakpoint];
  }

  /**
   * Check if breakpoint is not exceeded
   */
  isBelowBreakpoint(breakpoint: keyof Breakpoints): boolean {
    return this.currentState.viewport.width < this.breakpoints[breakpoint];
  }

  /**
   * Set custom breakpoints
   */
  setBreakpoints(breakpoints: Partial<Breakpoints>): void {
    this.breakpoints = { ...this.breakpoints, ...breakpoints };
    this.updateState();
  }

  /**
   * Apply responsive CSS class to element
   */
  applyResponsiveClass(element: HTMLElement): void {
    const state = this.currentState;
    
    // Remove all device type classes
    element.classList.remove('device-mobile', 'device-tablet', 'device-desktop');
    element.classList.add(`device-${state.deviceType}`);
    
    // Add orientation classes
    element.classList.remove('orientation-portrait', 'orientation-landscape');
    if (state.viewport.isPortrait) {
      element.classList.add('orientation-portrait');
    } else {
      element.classList.add('orientation-landscape');
    }
    
    // Add touch class
    if (state.isTouchDevice) {
      element.classList.add('has-touch');
    } else {
      element.classList.remove('has-touch');
    }
  }

  /**
   * Apply responsive styles to element
   */
  applyResponsiveStyles(
    element: HTMLElement,
    styles: {
      mobile?: Partial<CSSStyleDeclaration>;
      tablet?: Partial<CSSStyleDeclaration>;
      desktop?: Partial<CSSStyleDeclaration>;
    }
  ): void {
    const deviceStyles = styles[this.currentState.deviceType];
    if (deviceStyles) {
      Object.assign(element.style, deviceStyles);
    }
  }

  /**
   * Calculate responsive value based on viewport width
   * Useful for dynamic sizing
   */
  calculateResponsiveValue(
    mobileValue: number,
    tabletValue: number,
    desktopValue: number
  ): number {
    switch (this.currentState.deviceType) {
      case 'mobile':
        return mobileValue;
      case 'tablet':
        return tabletValue;
      case 'desktop':
        return desktopValue;
      default:
        return desktopValue;
    }
  }

  /**
   * Get safe area insets (for notched devices)
   */
  getSafeAreaInsets(): {
    top: number;
    right: number;
    bottom: number;
    left: number;
  } {
    // Browser support for CSS safe-area-inset
    const style = getComputedStyle(document.documentElement);
    const getInsetter = (variable: string): number => {
      const value = style.getPropertyValue(`--safe-area-inset-${variable}`).trim();
      return value ? parseInt(value) : 0;
    };

    return {
      top: getInsetter('top'),
      right: getInsetter('right'),
      bottom: getInsetter('bottom'),
      left: getInsetter('left'),
    };
  }

  /**
   * Setup viewport meta tag for mobile
   */
  setupViewportMeta(): void {
    let viewport = document.querySelector('meta[name="viewport"]');
    
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.setAttribute('name', 'viewport');
      document.head.appendChild(viewport);
    }
    
    viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes'
    );
  }

  /**
   * Destroy singleton (for cleanup)
   */
  destroy(): void {
    this.listeners.clear();
    ResponsiveManager.instance = null;
  }
}

/**
 * Create iOS-style safe area CSS variables
 */
export function setupSafeAreaVariables(): void {
  const updateSafeAreas = () => {
    const root = document.documentElement;
    const insets = ResponsiveManager.getInstance().getSafeAreaInsets();
    
    root.style.setProperty('--safe-area-inset-top', `${insets.top}px`);
    root.style.setProperty('--safe-area-inset-right', `${insets.right}px`);
    root.style.setProperty('--safe-area-inset-bottom', `${insets.bottom}px`);
    root.style.setProperty('--safe-area-inset-left', `${insets.left}px`);
  };
  
  updateSafeAreas();
  window.addEventListener('orientationchange', updateSafeAreas);
}

/**
 * Export singleton instance for easy access
 */
export const responsive = ResponsiveManager.getInstance();

/**
 * Hook for components to subscribe to responsive changes
 */
export function useResponsive() {
  const manager = ResponsiveManager.getInstance();
  const state = manager.getState();
  
  return {
    state,
    subscribe: manager.subscribe.bind(manager),
    isMobile: manager.isMobile.bind(manager),
    isTablet: manager.isTablet.bind(manager),
    isDesktop: manager.isDesktop.bind(manager),
    isPortrait: manager.isPortrait.bind(manager),
    isLandscape: manager.isLandscape.bind(manager),
    getWidth: manager.getWidth.bind(manager),
    getHeight: manager.getHeight.bind(manager),
    isTouchDevice: state.isTouchDevice,
  };
}
