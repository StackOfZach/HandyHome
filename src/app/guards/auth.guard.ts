import { Injectable, inject } from '@angular/core';
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
          // Check if we have a cached session that might be restoring
          const hasCachedSession =
            this.authService.isAuthenticatedWithFallback();
          if (hasCachedSession) {
            console.log(
              'AuthGuard: Cached session found, waiting for restoration...'
            );
            // Wait a bit for session restoration to complete
            await new Promise((resolve) => setTimeout(resolve, 100));
            const restoredUser = this.authService.getCurrentUser();
            if (restoredUser) {
              console.log('AuthGuard: Session restored, continuing...');
              return this.checkRouteAccess(
                route,
                restoredUser,
                this.authService.getCurrentUserProfile()
              );
            }
          }

          // No user found, redirect to login
          console.log('AuthGuard: No user found, redirecting to login');
          console.log('AuthGuard: Attempted route:', route.routeConfig?.path);
          this.router.navigate(['/pages/auth/login']);
          return false;
        }

        // User is authenticated, check if they have access to this route
        try {
          const userProfile = await this.authService.getUserProfile(user.uid);
          console.log(
            'AuthGuard: User profile:',
            userProfile ? userProfile.role : 'null'
          );

          if (!userProfile) {
            console.log('AuthGuard: No profile found, redirecting to login');
            this.router.navigate(['/pages/auth/login']);
            return false;
          }

          return this.checkRouteAccess(route, user, userProfile);
        } catch (error) {
          console.error('AuthGuard: Error fetching user profile:', error);
          this.router.navigate(['/pages/auth/login']);
          return false;
        }
      }),
      map((result) => result)
    );
  }

  private async checkRouteAccess(
    route: ActivatedRouteSnapshot,
    user: any,
    userProfile: any
  ): Promise<boolean> {
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
      console.log('AuthGuard: Role mismatch, redirecting based on user role');
      await this.redirectBasedOnRole(userProfile.role);
      return false;
    }

    // Special handling for worker routes
    if (userProfile.role === 'worker') {
      const currentPath = route.routeConfig?.path;

      try {
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

        // Always allow access to dashboard regardless of verification status
        // This prevents users from being logged out due to verification issues
        if (currentPath === 'pages/worker/dashboard') {
          console.log('AuthGuard: Worker access granted to dashboard');
          return true;
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

        // If trying to access interview but already completed (even if not verified yet)
        // Allow access so they can see the completion status
        if (currentPath === 'pages/worker/interview' && hasCompleted) {
          console.log(
            'AuthGuard: Worker completed interview, checking verification in page'
          );
          return true;
        }
      } catch (error) {
        console.error('AuthGuard: Error checking worker status:', error);
        // On error checking worker status, allow access to prevent logout
        return true;
      }
    }

    // User has access
    console.log('AuthGuard: Access granted');
    return true;
  }

  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    switch (role) {
      case 'client':
        // Check if client is verified - unverified clients should not be logged in
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            const { ClientVerificationService } = await import(
              '../services/client-verification.service'
            );
            const clientVerificationService =
              new (ClientVerificationService as any)();

            const isVerified = await clientVerificationService.isClientVerified(
              user.uid
            );
            if (isVerified) {
              this.router.navigate(['/pages/client/dashboard']);
            } else {
              // Unverified clients should not be logged in
              await this.authService.logout();
              this.router.navigate(['/pages/auth/login']);
            }
          } else {
            this.router.navigate(['/pages/auth/login']);
          }
        } catch (error) {
          console.error(
            'AuthGuard: Error checking client verification:',
            error
          );
          this.router.navigate(['/pages/auth/login']);
        }
        break;
      case 'worker':
        try {
          // For workers, check interview status before redirecting
          const user = this.authService.getCurrentUser();
          if (user) {
            const { WorkerService } = await import(
              '../services/worker.service'
            );
            const workerService = new (WorkerService as any)(
              (this.authService as any).firestore
            );

            const hasCompleted = await workerService.hasCompletedInterview(
              user.uid
            );

            if (!hasCompleted) {
              this.router.navigate(['/pages/worker/interview']);
            } else {
              // Always redirect to dashboard regardless of verification status
              this.router.navigate(['/pages/worker/dashboard']);
            }
          } else {
            this.router.navigate(['/pages/auth/login']);
          }
        } catch (error) {
          console.error('AuthGuard: Error in worker redirection:', error);
          // On error, default to dashboard
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
