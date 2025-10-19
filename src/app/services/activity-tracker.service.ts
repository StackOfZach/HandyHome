import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ActivityTrackerService {
  private activityTimer: any;
  private readonly ACTIVITY_UPDATE_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(private authService: AuthService) {
    this.initializeActivityTracking();
  }

  /**
   * Initialize activity tracking
   */
  private initializeActivityTracking(): void {
    // Track various user interactions
    const events = ['click', 'scroll', 'keypress', 'mousemove', 'touchstart'];

    events.forEach((event) => {
      document.addEventListener(event, this.onUserActivity.bind(this), true);
    });

    // Set up periodic activity updates
    this.startActivityTimer();
  }

  /**
   * Handle user activity
   */
  private onUserActivity(): void {
    // Throttle activity updates to avoid excessive localStorage writes
    if (!this.activityTimer) {
      this.updateActivity();
      this.startActivityTimer();
    }
  }

  /**
   * Update user activity timestamp
   */
  private updateActivity(): void {
    // Only update if user is logged in
    if (this.authService.getCurrentUser()) {
      this.authService.updateUserActivity();
    }
  }

  /**
   * Start activity timer
   */
  private startActivityTimer(): void {
    this.activityTimer = setTimeout(() => {
      this.activityTimer = null;
    }, this.ACTIVITY_UPDATE_INTERVAL);
  }

  /**
   * Stop activity tracking (for cleanup)
   */
  stopTracking(): void {
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
      this.activityTimer = null;
    }
  }
}
