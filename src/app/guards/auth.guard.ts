import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable } from 'rxjs';
import { map, take, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> {
    console.log(
      'AuthGuard: Checking access to route:',
      route.routeConfig?.path
    );
    return this.authService.currentUser$.pipe(
      take(1),
      switchMap(async (user) => {
        console.log('AuthGuard: Current user:', user ? user.uid : 'null');
        if (!user) {
          // User is not authenticated, redirect to login
          console.log('AuthGuard: No user found, redirecting to login');
          this.router.navigate(['/pages/auth/login']);
          return false;
        }

        // User is authenticated, check if they have access to this route
        const userProfile = await this.authService.getUserProfile(user.uid);
        console.log(
          'AuthGuard: User profile:',
          userProfile ? userProfile.role : 'null'
        );
        if (!userProfile) {
          // No profile found, redirect to login
          console.log('AuthGuard: No profile found, redirecting to login');
          this.router.navigate(['/pages/auth/login']);
          return false;
        }

        // Get the expected role from route data
        const expectedRole = route.data?.['role'];
        console.log(
          'AuthGuard: Expected role:',
          expectedRole,
          'User role:',
          userProfile.role
        );

        if (expectedRole && userProfile.role !== expectedRole) {
          // User doesn't have the right role, redirect to their appropriate dashboard
          console.log(
            'AuthGuard: Role mismatch, redirecting based on user role'
          );
          await this.redirectBasedOnRole(userProfile.role);
          return false;
        }

        // Special handling for worker routes
        if (userProfile.role === 'worker') {
          const currentPath = route.routeConfig?.path;

          // Import WorkerService dynamically to avoid circular dependency
          const { WorkerService } = await import('../services/worker.service');
          const workerService = new (WorkerService as any)(
            (this.authService as any).firestore
          );

          const hasCompleted = await workerService.hasCompletedInterview(
            user.uid
          );
          const isVerified = await workerService.isWorkerVerified(user.uid);

          // If trying to access dashboard but haven't completed interview
          if (currentPath === 'pages/worker/dashboard' && !hasCompleted) {
            console.log(
              "AuthGuard: Worker hasn't completed interview, redirecting"
            );
            this.router.navigate(['/pages/worker/interview']);
            return false;
          }

          // If trying to access dashboard but not verified
          if (currentPath === 'pages/worker/dashboard' && !isVerified) {
            console.log('AuthGuard: Worker not verified, redirecting to login');
            this.router.navigate(['/pages/auth/login']);
            return false;
          }

          // If trying to access interview but already completed and verified
          if (
            currentPath === 'pages/worker/interview' &&
            hasCompleted &&
            isVerified
          ) {
            console.log(
              'AuthGuard: Worker already verified, redirecting to dashboard'
            );
            this.router.navigate(['/pages/worker/dashboard']);
            return false;
          }
        }

        // User has access
        console.log('AuthGuard: Access granted');
        return true;
      }),
      map((result) => result)
    );
  }

  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    switch (role) {
      case 'client':
        this.router.navigate(['/pages/client/dashboard']);
        break;
      case 'worker':
        // For workers, check interview status before redirecting
        const user = this.authService.getCurrentUser();
        if (user) {
          const { WorkerService } = await import('../services/worker.service');
          const workerService = new (WorkerService as any)(
            (this.authService as any).firestore
          );

          const hasCompleted = await workerService.hasCompletedInterview(
            user.uid
          );
          const isVerified = await workerService.isWorkerVerified(user.uid);

          if (!hasCompleted) {
            this.router.navigate(['/pages/worker/interview']);
          } else if (!isVerified) {
            this.router.navigate(['/pages/auth/login']);
          } else {
            this.router.navigate(['/pages/worker/dashboard']);
          }
        } else {
          this.router.navigate(['/pages/auth/login']);
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
