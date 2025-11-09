import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, from } from 'rxjs';
import { map, take, switchMap } from 'rxjs/operators';

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
      switchMap((user: any) => {
        return from(this.handleUserAccess(user, route));
      })
    );
  }

  private async handleUserAccess(
    user: any,
    route: ActivatedRouteSnapshot
  ): Promise<boolean> {
    if (user) {
      // User is authenticated, check if they have a profile
      const userProfile = this.authService.getCurrentUserProfile();

      if (userProfile) {
        // Special case: Handle client verification page access
        const currentPath = route.routeConfig?.path;
        console.log('AuthenticatedGuard: Current path:', currentPath);
        console.log('AuthenticatedGuard: User role:', userProfile.role);

        if (
          currentPath === 'pages/auth/client-verification' &&
          userProfile.role === 'client'
        ) {
          // Client verification page should not be accessible to logged in clients
          // Unverified clients should not be able to login at all
          console.log(
            'AuthenticatedGuard: Client trying to access verification page, checking status'
          );
          try {
            const { ClientVerificationService } = await import(
              '../services/client-verification.service'
            );
            const clientVerificationService =
              new (ClientVerificationService as any)();

            const isVerified = await clientVerificationService.isClientVerified(
              user.uid
            );
            if (isVerified) {
              console.log(
                'AuthenticatedGuard: Client already verified, redirecting to dashboard'
              );
              this.router.navigate(['/pages/client/dashboard'], {
                replaceUrl: true,
              });
              return false;
            } else {
              console.log(
                'AuthenticatedGuard: Client not verified, should not be logged in - redirecting to login'
              );
              // Unverified clients shouldn't be logged in, redirect to login
              this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
              return false;
            }
          } catch (error) {
            console.error(
              'AuthenticatedGuard: Error checking client verification:',
              error
            );
            this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
            return false;
          }
        }

        console.log(
          'AuthenticatedGuard: User is authenticated, redirecting based on role'
        );
        this.redirectBasedOnRole(userProfile.role);
        return false; // Prevent access to auth pages
      }
    }

    // User is not authenticated or no profile, allow access to auth pages
    console.log('AuthenticatedGuard: Allowing access to auth page');
    return true;
  }

  private async redirectBasedOnRole(
    role: 'client' | 'worker' | 'admin'
  ): Promise<void> {
    console.log('AuthenticatedGuard: Redirecting based on role:', role);

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
              console.log(
                'AuthenticatedGuard: Client is verified, redirecting to dashboard'
              );
              this.router.navigate(['/pages/client/dashboard'], {
                replaceUrl: true,
              });
            } else {
              console.log(
                'AuthenticatedGuard: Client not verified, logging out and redirecting to login'
              );
              // Unverified clients should not be logged in
              await this.authService.logout();
              this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
            }
          } else {
            this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
          }
        } catch (error) {
          console.error(
            'AuthenticatedGuard: Error checking client verification:',
            error
          );
          this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
        }
        break;
      case 'worker':
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            // Import WorkerService dynamically to avoid circular dependency
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
              this.router.navigate(['/pages/worker/interview'], {
                replaceUrl: true,
              });
            } else {
              this.router.navigate(['/pages/worker/dashboard'], {
                replaceUrl: true,
              });
            }
          } else {
            this.router.navigate(['/pages/worker/dashboard'], {
              replaceUrl: true,
            });
          }
        } catch (error) {
          console.error(
            'AuthenticatedGuard: Error checking worker status:',
            error
          );
          this.router.navigate(['/pages/worker/dashboard'], {
            replaceUrl: true,
          });
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
