import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { AuthService } from './auth.service';
import { Location } from '@angular/common';
import { filter } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class NavigationBlockService {
  private authRoutes = [
    '/pages/auth/login',
    '/pages/auth/signup',
    '/pages/auth/forgot-password',
    '/pages/auth/client-verification',
    '/home',
    '/'
  ];

  constructor(
    private router: Router,
    private authService: AuthService,
    private location: Location
  ) {
    this.initializeNavigationBlocking();
  }

  private initializeNavigationBlocking(): void {
    // Listen for navigation end events
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.checkAndBlockNavigation(event.url);
      });

    // Listen for browser back/forward navigation
    window.addEventListener('popstate', (event) => {
      this.handlePopState(event);
    });
  }

  private checkAndBlockNavigation(url: string): void {
    const isAuthRoute = this.authRoutes.some(route => 
      url === route || url.startsWith(route + '?') || url.startsWith(route + '#')
    );

    if (isAuthRoute && this.authService.isAuthenticated()) {
      const profile = this.authService.getCurrentUserProfile();
      if (profile) {
        console.log('NavigationBlockService: Blocking navigation to auth route:', url);
        this.redirectToUserDashboard(profile.role);
      }
    }
  }

  private handlePopState(event: PopStateEvent): void {
    const currentUrl = this.location.path();
    const isAuthRoute = this.authRoutes.some(route => 
      currentUrl === route || currentUrl.startsWith(route + '?') || currentUrl.startsWith(route + '#')
    );

    if (isAuthRoute && this.authService.isAuthenticated()) {
      const profile = this.authService.getCurrentUserProfile();
      if (profile) {
        console.log('NavigationBlockService: Browser navigation blocked to auth route:', currentUrl);
        event.preventDefault();
        this.redirectToUserDashboard(profile.role);
      }
    }
  }

  private async redirectToUserDashboard(role: 'client' | 'worker' | 'admin'): Promise<void> {
    switch (role) {
      case 'client':
        this.router.navigate(['/pages/client/dashboard'], { replaceUrl: true });
        break;
      case 'worker':
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            const { WorkerService } = await import('./worker.service');
            const workerService = new (WorkerService as any)(
              (this.authService as any).firestore
            );

            const hasCompleted = await workerService.hasCompletedInterview(
              user.uid
            );

            if (!hasCompleted) {
              this.router.navigate(['/pages/worker/interview'], { replaceUrl: true });
            } else {
              this.router.navigate(['/pages/worker/dashboard'], { replaceUrl: true });
            }
          } else {
            this.router.navigate(['/pages/worker/dashboard'], { replaceUrl: true });
          }
        } catch (error) {
          console.error('NavigationBlockService: Error checking worker status:', error);
          this.router.navigate(['/pages/worker/dashboard'], { replaceUrl: true });
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard'], { replaceUrl: true });
        break;
    }
  }

  /**
   * Call this method when user logs out to stop blocking navigation
   */
  clearNavigationBlocking(): void {
    // This can be called by auth service when user logs out
    console.log('NavigationBlockService: Clearing navigation blocking');
  }
}