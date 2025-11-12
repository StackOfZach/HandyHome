import { Injectable } from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ClientVerificationService } from '../services/client-verification.service';
import { Observable, from } from 'rxjs';
import { map, take, switchMap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root',
})
export class AuthenticatedGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router,
    private clientVerificationService: ClientVerificationService
  ) {}

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

        // Allow access to signup page even for authenticated users
        // This handles cases where users want to create new accounts or have session issues
        if (currentPath === 'pages/auth/signup') {
          console.log('AuthenticatedGuard: Allowing access to signup page');
          return true;
        }

        if (
          currentPath === 'pages/auth/client-verification' &&
          userProfile.role === 'client'
        ) {
          // Client verification page access logic
          console.log(
            'AuthenticatedGuard: Client trying to access verification page, checking status'
          );
          try {
            console.log(
              'AuthenticatedGuard: About to check if client is verified for user:',
              user.uid
            );
            const isVerified =
              await this.clientVerificationService.isClientVerified(user.uid);
            console.log(
              'AuthenticatedGuard: Verification check result:',
              isVerified
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
                'AuthenticatedGuard: Client not verified, allowing access to verification page'
              );
              // Allow unverified clients to access verification page
              return true;
            }
          } catch (error) {
            console.error(
              'AuthenticatedGuard: Error checking client verification:',
              error
            );
            // On error, allow access to verification page
            console.log(
              'AuthenticatedGuard: Verification check failed, allowing access to verification page'
            );
            return true;
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
        // For authenticated clients, check verification and redirect appropriately
        try {
          const user = this.authService.getCurrentUser();
          if (user) {
            const isVerified =
              await this.clientVerificationService.isClientVerified(user.uid);
            if (isVerified) {
              console.log(
                'AuthenticatedGuard: Client is verified, redirecting to dashboard'
              );
              this.router.navigate(['/pages/client/dashboard'], {
                replaceUrl: true,
              });
            } else {
              console.log(
                'AuthenticatedGuard: Client not verified, redirecting to verification page'
              );
              // Don't logout, redirect to verification page
              this.router.navigate(['/pages/auth/client-verification'], {
                replaceUrl: true,
              });
            }
          } else {
            this.router.navigate(['/pages/auth/login'], { replaceUrl: true });
          }
        } catch (error) {
          console.error(
            'AuthenticatedGuard: Error checking client verification:',
            error
          );
          // On error, redirect to verification page instead of login
          this.router.navigate(['/pages/auth/client-verification'], {
            replaceUrl: true,
          });
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
