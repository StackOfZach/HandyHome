import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit {
  showSplash = true;
  isAuthenticated = false;

  constructor(private authService: AuthService, private router: Router) {}

  async ngOnInit() {
    try {
      // Wait for auth service to initialize
      await this.authService.waitForAuthInitialization();

      // Check if user is authenticated
      const currentUser = this.authService.getCurrentUser();
      const currentProfile = this.authService.getCurrentUserProfile();

      if (currentUser && currentProfile) {
        this.isAuthenticated = true;
        // User is authenticated, navigate to appropriate dashboard
        await this.navigateToAppropriatePage(
          currentProfile.role,
          currentUser.uid
        );
      } else {
        // No user, show login page
        this.isAuthenticated = false;
        this.router.navigate(['/pages/auth/login']);
      }
    } catch (error) {
      console.error('App initialization error:', error);
      this.isAuthenticated = false;
      this.router.navigate(['/pages/auth/login']);
    } finally {
      // Hide splash screen after a minimum delay for better UX
      setTimeout(() => {
        this.showSplash = false;
      }, 1000);
    }
  }

  private async navigateToAppropriatePage(
    role: 'client' | 'worker' | 'admin',
    uid: string
  ): Promise<void> {
    switch (role) {
      case 'client':
        this.router.navigate(['/pages/client/dashboard']);
        break;
      case 'worker':
        try {
          const { WorkerService } = await import('./services/worker.service');
          const workerService = new (WorkerService as any)(
            (this.authService as any).firestore
          );
          const hasCompleted = await workerService.hasCompletedInterview(uid);

          if (!hasCompleted) {
            this.router.navigate(['/pages/worker/interview']);
          } else {
            this.router.navigate(['/pages/worker/dashboard']);
          }
        } catch (error) {
          console.error('Error checking worker status:', error);
          this.router.navigate(['/pages/worker/dashboard']);
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard']);
        break;
      default:
        this.router.navigate(['/pages/auth/login']);
    }
  }
}
