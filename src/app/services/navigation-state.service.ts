import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface UserNavigationState {
  lastVisitedRoute: string;
  routeHistory: string[];
  timestamp: number;
  userRole?: 'client' | 'worker' | 'admin';
  tabSelections?: { [key: string]: string }; // For tab-based pages
  pageStates?: { [key: string]: any }; // For form data, filters, etc.
}

@Injectable({
  providedIn: 'root',
})
export class NavigationStateService {
  private readonly STORAGE_KEY = 'handyhome_navigation_state';
  private readonly MAX_HISTORY_LENGTH = 10;
  private readonly STATE_EXPIRY_HOURS = 24;

  private navigationStateSubject =
    new BehaviorSubject<UserNavigationState | null>(null);
  public navigationState$ = this.navigationStateSubject.asObservable();

  private currentState: UserNavigationState | null = null;

  constructor(private router: Router) {
    this.initializeNavigationTracking();
    this.loadNavigationState();
  }

  /**
   * Initialize navigation tracking
   */
  private initializeNavigationTracking(): void {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.updateNavigationState(event.urlAfterRedirects);
      });
  }

  /**
   * Load navigation state from localStorage
   */
  private loadNavigationState(): void {
    try {
      const storedState = localStorage.getItem(this.STORAGE_KEY);
      if (storedState) {
        const parsedState: UserNavigationState = JSON.parse(storedState);

        // Check if state is not expired (24 hours)
        const isExpired =
          Date.now() - parsedState.timestamp >
          this.STATE_EXPIRY_HOURS * 60 * 60 * 1000;

        if (!isExpired) {
          this.currentState = parsedState;
          this.navigationStateSubject.next(parsedState);
          console.log('Loaded navigation state:', parsedState);
        } else {
          console.log('Navigation state expired, clearing...');
          this.clearNavigationState();
        }
      }
    } catch (error) {
      console.error('Error loading navigation state:', error);
      this.clearNavigationState();
    }
  }

  /**
   * Update navigation state with new route
   */
  private updateNavigationState(route: string): void {
    // Don't track auth pages or home page
    if (route.includes('/pages/auth/') || route === '/home') {
      return;
    }

    const now = Date.now();

    if (!this.currentState) {
      this.currentState = {
        lastVisitedRoute: route,
        routeHistory: [route],
        timestamp: now,
        tabSelections: {},
        pageStates: {},
      };
    } else {
      this.currentState.lastVisitedRoute = route;
      this.currentState.timestamp = now;

      // Add to history if it's different from the last route
      const lastRoute =
        this.currentState.routeHistory[
          this.currentState.routeHistory.length - 1
        ];
      if (lastRoute !== route) {
        this.currentState.routeHistory.push(route);

        // Keep history length manageable
        if (this.currentState.routeHistory.length > this.MAX_HISTORY_LENGTH) {
          this.currentState.routeHistory = this.currentState.routeHistory.slice(
            -this.MAX_HISTORY_LENGTH
          );
        }
      }
    }

    this.saveNavigationState();
    this.navigationStateSubject.next(this.currentState);
  }

  /**
   * Set user role for navigation state
   */
  setUserRole(role: 'client' | 'worker' | 'admin'): void {
    if (this.currentState) {
      this.currentState.userRole = role;
      this.saveNavigationState();
      this.navigationStateSubject.next(this.currentState);
    }
  }

  /**
   * Save tab selection for a specific page
   */
  saveTabSelection(pageRoute: string, tabId: string): void {
    if (!this.currentState) {
      this.currentState = {
        lastVisitedRoute: this.router.url,
        routeHistory: [this.router.url],
        timestamp: Date.now(),
        tabSelections: {},
        pageStates: {},
      };
    }

    if (!this.currentState.tabSelections) {
      this.currentState.tabSelections = {};
    }

    this.currentState.tabSelections[pageRoute] = tabId;
    this.saveNavigationState();
  }

  /**
   * Get saved tab selection for a page
   */
  getTabSelection(pageRoute: string): string | null {
    return this.currentState?.tabSelections?.[pageRoute] || null;
  }

  /**
   * Save page state (form data, filters, etc.)
   */
  savePageState(pageRoute: string, state: any): void {
    if (!this.currentState) {
      this.currentState = {
        lastVisitedRoute: this.router.url,
        routeHistory: [this.router.url],
        timestamp: Date.now(),
        tabSelections: {},
        pageStates: {},
      };
    }

    if (!this.currentState.pageStates) {
      this.currentState.pageStates = {};
    }

    this.currentState.pageStates[pageRoute] = state;
    this.saveNavigationState();
  }

  /**
   * Get saved page state
   */
  getPageState(pageRoute: string): any {
    return this.currentState?.pageStates?.[pageRoute] || null;
  }

  /**
   * Save navigation state to localStorage
   */
  private saveNavigationState(): void {
    try {
      if (this.currentState) {
        localStorage.setItem(
          this.STORAGE_KEY,
          JSON.stringify(this.currentState)
        );
      }
    } catch (error) {
      console.error('Error saving navigation state:', error);
    }
  }

  /**
   * Get the last visited route for navigation restoration
   */
  getLastVisitedRoute(): string | null {
    return this.currentState?.lastVisitedRoute || null;
  }

  /**
   * Get route history
   */
  getRouteHistory(): string[] {
    return this.currentState?.routeHistory || [];
  }

  /**
   * Navigate to last visited route if available
   */
  navigateToLastVisited(): boolean {
    const lastRoute = this.getLastVisitedRoute();
    const userRole = this.currentState?.userRole;

    if (lastRoute && userRole) {
      // Validate that the route is appropriate for the user's role
      if (this.isValidRouteForRole(lastRoute, userRole)) {
        console.log('Navigating to last visited route:', lastRoute);
        this.router.navigate([lastRoute]);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if route is valid for user role
   */
  private isValidRouteForRole(
    route: string,
    role: 'client' | 'worker' | 'admin'
  ): boolean {
    // Don't navigate to auth pages
    if (route.includes('/pages/auth/')) {
      return false;
    }

    // Check role-specific routes
    if (route.includes('/pages/client/') && role !== 'client') {
      return false;
    }
    if (route.includes('/pages/worker/') && role !== 'worker') {
      return false;
    }
    if (route.includes('/pages/admin/') && role !== 'admin') {
      return false;
    }

    return true;
  }

  /**
   * Clear navigation state
   */
  clearNavigationState(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      this.currentState = null;
      this.navigationStateSubject.next(null);
    } catch (error) {
      console.error('Error clearing navigation state:', error);
    }
  }

  /**
   * Get current navigation state
   */
  getCurrentState(): UserNavigationState | null {
    return this.currentState;
  }
}
