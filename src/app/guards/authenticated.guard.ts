import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthenticatedGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    console.log(
      'AuthenticatedGuard: Checking if user should access auth route:',
      route.routeConfig?.path
    );

    return this.authService.currentUser$.pipe(
      take(1),
      map((user) => {
        if (user) {
          // User is authenticated, check if they have a profile
          const userProfile = this.authService.getCurrentUserProfile();
          
          if (userProfile) {
            console.log(
              'AuthenticatedGuard: User is authenticated, redirecting to dashboard'
            );
            this.redirectBasedOnRole(userProfile.role);
            return false; // Prevent access to auth pages
          }
        }

        // User is not authenticated or no profile, allow access to auth pages
        console.log('AuthenticatedGuard: Allowing access to auth page');
        return true;
      })
    );
  }

  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    console.log('AuthenticatedGuard: Redirecting based on role:', role);
    
    switch (role) {
      case 'client':
        this.router.navigate(['/pages/client/dashboard'], { replaceUrl: true });
        break;
      case 'worker':
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            // Import WorkerService dynamically to avoid circular dependency
            const { WorkerService } = await import('../services/worker.service');
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
          console.error('AuthenticatedGuard: Error checking worker status:', error);
          this.router.navigate(['/pages/worker/dashboard'], { replaceUrl: true });
        }
        break;
      case 'admin':
        this.router.navigate(['/pages/admin/dashboard'], { replaceUrl: true });
        break;
      default:
        // If role is unknown, don't redirect and allow access to auth pages
        console.log('AuthenticatedGuard: Unknown role, allowing auth access');
        break;
    }
  }
}