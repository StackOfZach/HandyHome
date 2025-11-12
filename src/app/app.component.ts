import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { ClientVerificationService } from './services/client-verification.service';
import { NavigationBlockService } from './services/navigation-block.service';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  showSplash = true;
  splashFadeOut = false;
  isAuthenticated = false;
  private splashMinDuration = 1500; // Minimum splash screen duration
  private splashStartTime = Date.now();

  constructor(
    private authService: AuthService,
    private router: Router,
    private navigationBlockService: NavigationBlockService,
    private clientVerificationService: ClientVerificationService
  ) {}

  async ngOnInit() {
    console.log('AppComponent: Initializing app...');

    try {
      // On Android, proactively request location permission on first launch
      if (Capacitor.getPlatform() === 'android') {
        try {
          const status = await Geolocation.checkPermissions();
          if (status.location !== 'granted') {
            await Geolocation.requestPermissions();
          }
        } catch (permError) {
          console.warn('Location permission check/request failed:', permError);
        }
      }

      // Wait for auth service to initialize
      console.log('AppComponent: Waiting for auth initialization...');
      await this.authService.waitForAuthInitialization();

      // Check if user is authenticated
      const currentUser = this.authService.getCurrentUser();
      const currentProfile = this.authService.getCurrentUserProfile();

      console.log('AppComponent: User check result:', {
        hasUser: !!currentUser,
        hasProfile: !!currentProfile,
        role: currentProfile?.role,
      });

      if (currentUser && currentProfile) {
        this.isAuthenticated = true;

        // Check current URL to avoid redirecting users who are already on appropriate pages
        const currentUrl = this.router.url;
        console.log('AppComponent: Current URL:', currentUrl);

        // Don't redirect if client is already on verification page or auth pages
        if (
          currentProfile.role === 'client' &&
          (currentUrl.includes('/pages/auth/client-verification') ||
            currentUrl.includes('/pages/auth/'))
        ) {
          console.log(
            'AppComponent: Client already on auth page, not redirecting'
          );
        } else {
          // User is authenticated, navigate to appropriate dashboard
          console.log(
            'AppComponent: User authenticated, navigating to dashboard...'
          );
          await this.navigateToAppropriatePage(
            currentProfile.role,
            currentUser.uid
          );
        }
      } else {
        // No user, show login page
        console.log(
          'AppComponent: No authenticated user, navigating to login...'
        );
        this.isAuthenticated = false;
        // Use replaceUrl to prevent navigation history issues
        this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
      }
    } catch (error) {
      console.error('App initialization error:', error);
      this.isAuthenticated = false;
      this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
    } finally {
      // Ensure splash screen is shown for minimum duration for better UX
      this.hideSplashAfterMinimumDuration();
    }
  }

  /**
   * Ensure splash screen is shown for minimum duration
   */
  private hideSplashAfterMinimumDuration(): void {
    const elapsedTime = Date.now() - this.splashStartTime;
    const remainingTime = Math.max(0, this.splashMinDuration - elapsedTime);

    setTimeout(() => {
      console.log('AppComponent: Starting splash screen fade out');
      this.splashFadeOut = true;

      // Hide splash screen completely after fade animation
      setTimeout(() => {
        console.log('AppComponent: Hiding splash screen');
        this.showSplash = false;
        this.splashFadeOut = false;
      }, 400); // Match the CSS transition duration
    }, remainingTime);
  }

  private async navigateToAppropriatePage(
    role: 'client' | 'worker' | 'admin',
    uid: string
  ): Promise<void> {
    console.log('AppComponent: Navigating to appropriate page for role:', role);

    switch (role) {
      case 'client':
        // Check if client is verified but don't logout if not
        try {
          const isVerified =
            await this.clientVerificationService.isClientVerified(uid);
          if (isVerified) {
            console.log(
              'AppComponent: Client is verified, navigating to dashboard'
            );
            this.router.navigate(['/pages/client/dashboard'], {
              replaceUrl: true,
            });
          } else {
            console.log(
              'AppComponent: Client not verified, redirecting to verification'
            );
            // Redirect to verification instead of logging out
            this.router.navigate(['/pages/auth/client-verification'], {
              replaceUrl: true,
            });
          }
        } catch (error) {
          console.error(
            'AppComponent: Error checking client verification:',
            error
          );
          // On error, redirect to verification instead of login
          this.router.navigate(['/pages/auth/client-verification'], {
            replaceUrl: true,
          });
        }
        break;
      case 'worker':
        try {
          const { WorkerService } = await import('./services/worker.service');
          const workerService = new (WorkerService as any)(
            (this.authService as any).firestore
          );
          const hasCompleted = await workerService.hasCompletedInterview(uid);

          if (!hasCompleted) {
            console.log(
              'AppComponent: Worker interview not completed, navigating to interview'
            );
            this.router.navigate(['/pages/worker/interview'], {
              replaceUrl: true,
            });
          } else {
            console.log(
              'AppComponent: Worker interview completed, navigating to dashboard'
            );
            this.router.navigate(['/pages/worker/dashboard'], {
              replaceUrl: true,
            });
          }
        } catch (error) {
          console.error('AppComponent: Error checking worker status:', error);
          this.router.navigate(['/pages/worker/dashboard'], {
            replaceUrl: true,
          });
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard'], { replaceUrl: true });
        break;
      default:
        console.log('AppComponent: Unknown role, redirecting to login');
        this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
    }
  }
}
